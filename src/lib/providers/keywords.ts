// 按站点优化的关键词扩展

interface KeywordVariantSet {
  zh: string[];
  en: string[];
}

const KEYWORD_MAP: Record<string, KeywordVariantSet> = {
  '龙': {
    zh: ['龙', '中国龙', '龙雕', '龙纹'],
    en: ['dragon', 'Chinese dragon', 'dragon statue', 'dragon STL'],
  },
  '房屋': {
    zh: ['房屋', '民居', '古民居', '传统民居'],
    en: ['Chinese house', 'traditional house', 'ancient house'],
  },
  '亭子': {
    zh: ['亭子', '凉亭', '六角亭', '八角亭', '古亭'],
    en: ['pavilion', 'Chinese pavilion', 'hexagonal pavilion', 'pavilion STL'],
  },
  '塔': {
    zh: ['塔', '佛塔', '宝塔', '古塔', '木塔'],
    en: ['pagoda', 'Chinese pagoda', 'pagoda STL'],
  },
  '桥': {
    zh: ['桥', '石桥', '廊桥', '石拱桥'],
    en: ['bridge', 'stone bridge', 'Chinese bridge', 'arch bridge STL'],
  },
  '牌坊': {
    zh: ['牌坊', '牌楼', '石牌坊'],
    en: ['archway', 'paifang', 'Chinese archway'],
  },
  '殿': {
    zh: ['殿', '大殿', '宫殿', '佛殿'],
    en: ['palace', 'hall', 'Chinese palace', 'ancient hall'],
  },
  '庙': {
    zh: ['庙', '寺庙', '道观', '文庙'],
    en: ['temple', 'Chinese temple', 'temple STL'],
  },
  '祠': {
    zh: ['祠', '宗祠', '祠堂'],
    en: ['ancestral hall', 'Chinese ancestral hall'],
  },
  '院': {
    zh: ['院', '庭院', '四合院', '书院'],
    en: ['courtyard', 'siheyuan', 'Chinese courtyard'],
  },
  '园林': {
    zh: ['园林', '花园', '古典园林'],
    en: ['garden', 'Chinese garden', 'classical garden'],
  },
  '戏台': {
    zh: ['戏台', '古戏台', '戏曲台'],
    en: ['Chinese opera stage', 'opera stage'],
  },
  '门楼': {
    zh: ['门楼', '大门', '宅门', '城门'],
    en: ['gate', 'Chinese gate', 'city gate'],
  },
  '古建筑': {
    zh: ['古建筑', '传统建筑', '古代建筑'],
    en: ['ancient architecture', 'Chinese architecture', 'traditional architecture'],
  },
};

function normalizeKw(kw: string): string {
  return kw.toLowerCase().trim();
}

/** 根据用户输入匹配核心词（精确优先，子串兜底） */
function matchCoreKeyword(input: string): string | null {
  const normalized = normalizeKw(input);
  const keys = Object.keys(KEYWORD_MAP);

  // 精确匹配
  for (const key of keys) {
    if (normalizeKw(key) === normalized) return key;
  }

  // 包含匹配（长词优先）
  const sorted = keys.sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (normalized.includes(normalizeKw(key))) return key;
  }

  return null;
}

/**
 * 为指定站点生成关键词变体
 * @param keyword 原始关键词
 * @param preferEnglish 是否优先英文（英文站用）
 */
export function getKeywordVariants(keyword: string, preferEnglish = false): string[] {
  const core = matchCoreKeyword(keyword);
  if (!core) return [keyword];

  const variants = KEYWORD_MAP[core];
  if (!variants) return [keyword];

  const ordered = preferEnglish
    ? [...variants.en, ...variants.zh]
    : [...variants.zh, ...variants.en];

  // 去重并保留原始关键词在首位
  const seen = new Set<string>([keyword]);
  const result: string[] = [keyword];
  for (const v of ordered) {
    if (!seen.has(v)) {
      seen.add(v);
      result.push(v);
    }
  }
  return result;
}

/** 判断站点偏好英文 */
export function sitePrefersEnglish(siteId: string): boolean {
  switch (siteId) {
    case 'thingiverse':
    case 'printables':
    case 'yeggi':
      return true;
    default:
      return false;
  }
}
