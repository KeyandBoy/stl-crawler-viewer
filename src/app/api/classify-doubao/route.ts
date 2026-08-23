import { NextRequest, NextResponse } from 'next/server';
import { CATEGORIES } from '@/lib/classifier/rules';

const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_MODEL_ID = process.env.ARK_MODEL_ID || 'doubao-lite-32k-250828';
const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

const MAX_FILENAME_LENGTH = 200;

/** 豆包文本兜底分类：仅分析文件名，失败一律返回 null，不影响原分类流程 */
export async function POST(request: NextRequest) {
  try {
    if (!ARK_API_KEY) {
      return NextResponse.json({ error: '未配置 ARK_API_KEY（在 .env 中设置）' }, { status: 501 });
    }

    const body = await request.json();
    const filename = typeof body?.filename === 'string' ? body.filename.trim().slice(0, MAX_FILENAME_LENGTH) : '';
    if (!filename) {
      return NextResponse.json({ error: 'filename 不能为空' }, { status: 400 });
    }

    const systemPrompt = `你是中国古代建筑 3D 模型分类专家。根据给定的 STL 文件名，从以下类别中选择最匹配的一个：
${CATEGORIES.join('、')}
判断规则：
- 文件名包含明确建筑语义时选最具体的类别（如 hexagonal pavilion → 六角亭）
- 纯数字、编号（thing:12345）、untitled、model、未命名 等无语义名称 → 未分类
- 只能输出一个类别，禁止输出解释
以 JSON 格式返回：{"category":"类别名"}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(ARK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ARK_API_KEY}`,
        },
        body: JSON.stringify({
          model: ARK_MODEL_ID,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: filename },
          ],
          temperature: 0.1,
          max_tokens: 64,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text();
      console.error('[classify-doubao] API error:', res.status, text.slice(0, 300));
      return NextResponse.json({ error: `豆包 API 错误 ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return NextResponse.json({ error: '豆包返回格式异常' }, { status: 502 });
    }

    let category = '';
    try {
      category = String((JSON.parse(content) as { category?: unknown }).category || '').trim();
    } catch {
      const m = content.match(/"category"\s*:\s*"([^"]+)"/);
      category = m?.[1]?.trim() || '';
    }
    if (!category) {
      return NextResponse.json({ error: '未能解析豆包返回的类别' }, { status: 502 });
    }
    if (!CATEGORIES.includes(category)) {
      category = '未分类';
    }

    return NextResponse.json({ success: true, category });
  } catch (e) {
    console.error('[classify-doubao] Error:', e);
    return NextResponse.json({ error: '豆包分类失败' }, { status: 500 });
  }
}
