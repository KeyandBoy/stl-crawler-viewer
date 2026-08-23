/**
 * 古建筑分类规则表（浏览器与服务器共享）
 * - 关键词支持中文/英文，英文仅作内部匹配，输出一律中文
 * - 细分规则命中后，其父类（parents）得分被抑制，避免「六角亭」与「亭子」同时命中
 */

export interface Rule {
  label: string;
  keywords: string[];
  weight: number;
  parents?: string[];
}

export const RULES: Rule[] = [
  // ── 亭台楼阁 ──
  { label: '六角亭', keywords: ['六角亭', 'hexagonal pavilion', 'hexagonal gazebo', '6-sided pavilion'], weight: 1.0, parents: ['亭子'] },
  { label: '八角亭', keywords: ['八角亭', 'octagonal pavilion', 'octagonal gazebo', '8-sided pavilion'], weight: 1.0, parents: ['亭子'] },
  { label: '四角亭', keywords: ['四角亭', 'square pavilion', '4-sided pavilion'], weight: 1.0, parents: ['亭子'] },
  { label: '圆亭', keywords: ['圆亭', 'round pavilion', 'circular pavilion'], weight: 1.0, parents: ['亭子'] },
  { label: '廊亭', keywords: ['廊亭', 'corridor pavilion', 'covered walkway pavilion'], weight: 1.0, parents: ['亭子', '廊'] },
  { label: '亭子', keywords: ['亭子', '亭台', '凉亭', 'pavilion', 'gazebo', 'kiosk', 'booth'], weight: 0.9 },
  { label: '楼阁', keywords: ['楼阁', '阁楼', 'loft', 'attic', 'storied building', 'tower house'], weight: 0.9 },
  { label: '台', keywords: ['观星台', '烽火台', '点将台', '拜月台', 'platform', 'terrace', 'stage platform'], weight: 0.85 },
  { label: '戏台', keywords: ['戏台', '古戏台', '戏楼', 'opera stage', 'stage'], weight: 0.95, parents: ['台'] },
  { label: '廊', keywords: ['回廊', '游廊', '连廊', 'corridor', 'covered walkway'], weight: 0.85 },

  // ── 塔 ──
  { label: '宝塔', keywords: ['宝塔', '佛塔', 'pagoda', 'stupa', 'buddhist tower'], weight: 1.0, parents: ['塔'] },
  { label: '木塔', keywords: ['木塔', 'wooden tower', 'wooden pagoda'], weight: 1.0, parents: ['塔'] },
  { label: '砖塔', keywords: ['砖塔', 'brick tower', 'brick pagoda'], weight: 1.0, parents: ['塔'] },
  { label: '石塔', keywords: ['石塔', 'stone tower', 'stone pagoda'], weight: 1.0, parents: ['塔'] },
  { label: '雁塔', keywords: ['雁塔', '大雁塔', '小雁塔', 'wild goose pagoda'], weight: 1.0, parents: ['塔'] },
  { label: '塔', keywords: ['tower', 'turret', 'minaret', 'spire'], weight: 0.85 },

  // ── 桥 ──
  { label: '廊桥', keywords: ['廊桥', '风雨桥', 'covered bridge'], weight: 1.0, parents: ['桥', '廊'] },
  { label: '石拱桥', keywords: ['石拱桥', '拱桥', 'arch bridge', 'stone arch'], weight: 1.0, parents: ['桥'] },
  { label: '木桥', keywords: ['木桥', 'wooden bridge'], weight: 1.0, parents: ['桥'] },
  { label: '索桥', keywords: ['索桥', '吊桥', 'suspension bridge', 'rope bridge'], weight: 1.0, parents: ['桥'] },
  { label: '桥', keywords: ['bridge', 'viaduct', 'overpass'], weight: 0.85 },

  // ── 门楼牌坊 ──
  { label: '牌坊', keywords: ['牌坊', '牌楼', '石牌坊', '木牌坊', '功德坊', 'archway', 'memorial arch'], weight: 1.0 },
  { label: '城门', keywords: ['城门', '城楼', 'gate tower', 'city gate'], weight: 1.0 },
  { label: '门楼', keywords: ['门楼', '宅门', '大门', 'gate', 'entrance gate'], weight: 0.9 },

  // ── 殿堂庙宇 ──
  { label: '大殿', keywords: ['大殿', '正殿', '宫殿', '金銮殿', '大雄宝殿', 'main hall', 'palace hall'], weight: 1.0 },
  { label: '庙宇', keywords: ['寺庙', '道观', '文庙', '城隍庙', '土地庙', 'temple', 'shrine', 'taoist temple'], weight: 0.9 },
  { label: '寺院', keywords: ['寺院', '佛寺', '禅寺', 'monastery', 'buddhist temple'], weight: 0.9 },
  { label: '祠堂', keywords: ['祠堂', '宗祠', '家祠', 'ancestral hall', 'clan hall'], weight: 1.0 },

  // ── 民居院落 ──
  { label: '四合院', keywords: ['四合院', '北京四合院', 'courtyard house', 'beijing courtyard'], weight: 1.0, parents: ['民居'] },
  { label: '徽派民居', keywords: ['徽派', '徽州', '马头墙', '天井', 'horse head wall'], weight: 1.0, parents: ['民居'] },
  { label: '客家土楼', keywords: ['土楼', '客家', 'earthen building'], weight: 1.0, parents: ['民居'] },
  { label: '吊脚楼', keywords: ['吊脚楼', '苗族', '侗族', 'stilted house'], weight: 1.0, parents: ['民居'] },
  { label: '民居', keywords: ['民居', '民宅', '住宅', '古民居', 'traditional house', 'vernacular'], weight: 0.85 },

  // ── 园林景观 ──
  { label: '假山', keywords: ['假山', '太湖石', 'rockery', 'artificial mountain'], weight: 1.0, parents: ['园林'] },
  { label: '水榭', keywords: ['水榭', '水亭', 'waterside pavilion'], weight: 1.0, parents: ['园林'] },
  { label: '园林', keywords: ['园林', '花园', '苏州园林', 'garden', 'classical garden'], weight: 0.85 },

  // ── 装饰构件 ──
  { label: '斗拱', keywords: ['斗拱', 'bracket set', 'corbel bracket'], weight: 1.0 },
  { label: '飞檐', keywords: ['飞檐', '翘角', 'upturned eave', 'flying eave'], weight: 1.0 },
  { label: '榫卯', keywords: ['榫卯', '榫', '卯', 'mortise', 'tenon', 'joinery'], weight: 1.0 },
  { label: '龙', keywords: ['龙纹', '龙雕', '螭龙', 'dragon', 'loong'], weight: 0.95 },
  { label: '凤', keywords: ['凤凰', 'phoenix'], weight: 0.95 },
  { label: '石狮', keywords: ['石狮', '狮子', 'guardian lion', 'stone lion'], weight: 0.95 },
  { label: '雕塑', keywords: ['雕塑', '雕像', '石雕', '木雕', 'sculpture', 'statue', 'carving'], weight: 0.8 },

  // ── 通用建筑 ──
  { label: '古建筑', keywords: ['古建筑', '古建', '中式建筑', '传统建筑', 'ancient architecture', 'chinese architecture'], weight: 0.75 },
  { label: '建筑', keywords: ['building', 'architecture', 'structure', 'edifice'], weight: 0.5 },
];

/** 全部分类标签（用于豆包提示词约束与结果校验） */
export const CATEGORIES = RULES.map((r) => r.label);

export interface ClassificationResult {
  className: string;
  probability: number;
}

/** 文件名规则分类：细分命中时抑制其父类标签 */
export function classifyByFilename(filename: string): ClassificationResult[] {
  const lower = filename.toLowerCase();
  const hitRules = RULES.filter((rule) => rule.keywords.some((kw) => lower.includes(kw.toLowerCase())));

  const suppressed = new Set<string>();
  for (const rule of hitRules) {
    for (const p of rule.parents || []) suppressed.add(p);
  }

  const scores = new Map<string, number>();
  for (const rule of hitRules) {
    if (suppressed.has(rule.label)) continue;
    scores.set(rule.label, Math.max(scores.get(rule.label) || 0, rule.weight));
  }

  if (scores.size === 0) {
    return [{ className: '未分类', probability: 0.4 }];
  }

  return Array.from(scores.entries())
    .map(([className, probability]) => ({ className, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
}
