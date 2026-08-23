/**
 * 图书馆分类规则（可扩展）
 * - 分类通过 CATEGORIES 数组统一管理，新增分类只需追加一项
 * - 分类下拉、规则匹配、命名规范、排序均基于此文件
 */

export interface CategoryConfig {
  id: string;
  label: string;
  keywords: string[];
  icon?: string;
}

/** 所有分类（按显示顺序排列，未来扩展在此追加） */
export const CATEGORIES: CategoryConfig[] = [
  { id: '亭', label: '亭', keywords: ['亭', '凉亭', '六角亭', '八角亭', '四角亭', '圆亭', '廊亭', 'pavilion', 'gazebo'], icon: '🏛️' },
  { id: '塔', label: '塔', keywords: ['塔', '宝塔', '木塔', '砖塔', '石塔', '雁塔', '佛塔', 'pagoda', 'tower'], icon: '🗼' },
  { id: '桥', label: '桥', keywords: ['桥', '廊桥', '石拱桥', '拱桥', '木桥', '索桥', '吊桥', 'bridge'], icon: '🌉' },
  { id: '牌坊', label: '牌坊', keywords: ['牌坊', '牌楼', '城门', '门楼', 'archway', 'gate'], icon: '⛩️' },
  { id: '殿宇', label: '殿宇', keywords: ['殿', '庙', '寺', '祠', '宫', 'temple', 'shrine', 'palace'], icon: '🏯' },
  { id: '四合院', label: '四合院', keywords: ['四合院', '院落', ' courtyard', '徽派', '土楼', '吊脚楼', '民居'], icon: '🏠' },
  { id: '园林', label: '园林', keywords: ['园林', '假山', '水榭', '花园', 'garden'], icon: '🌳' },
  { id: '龙凤', label: '龙凤', keywords: ['龙', '凤', 'dragon', 'phoenix', '龙纹', '龙雕'], icon: '🐉' },
  { id: '雕塑', label: '雕塑', keywords: ['雕塑', '石狮', '狮子', 'sculpture', 'statue', 'carving'], icon: '🗿' },
  { id: '构件', label: '构件', keywords: ['斗拱', '飞檐', '榫卯', 'bracket', 'eave', 'mortise'], icon: '🔧' },
  { id: '古建筑', label: '古建筑', keywords: ['古建筑', '古建', '中式建筑', '传统建筑', 'ancient architecture'], icon: '🏛️' },
  { id: '建筑', label: '建筑', keywords: ['building', 'architecture', 'structure'], icon: '🏢' },
  { id: '其他', label: '其他', keywords: [], icon: '📦' },
];

export const UNCLASSIFIED = '未分类';

/** 所有分类 ID 列表（供下拉菜单使用） */
export function getCategoryIds(): string[] {
  return CATEGORIES.map((c) => c.id);
}

/** 根据文件名/标题匹配分类（规则匹配，不依赖 AI） */
export function classifyByRules(text: string): string {
  const lower = text.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.length === 0) continue;
    for (const kw of cat.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return cat.id;
      }
    }
  }
  return UNCLASSIFIED;
}

/** 清理文件名为显示名（去除分类前缀、编号、下划线、扩展名） */
export function generateDisplayName(originalFilename: string): string {
  let name = originalFilename
    .replace(/\.stl$/i, '')
    .replace(/\.STL$/i, '');
  // 去除已有分类前缀（如 "亭_六角亭_001" → "六角亭"）
  const parts = name.split(/[_\s]+/);
  if (parts.length >= 2) {
    // 如果第一段是已知分类，去掉
    const firstPart = parts[0];
    if (CATEGORIES.some((c) => c.id === firstPart)) {
      name = parts.slice(1).join('_');
    }
  }
  // 去除尾部编号（_001, _01 等）
  name = name.replace(/[_\s]*\d{1,4}$/, '');
  // 清理非法字符，保留中文、英文、数字
  name = name.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').replace(/^_+|_+$/g, '');
  return name || '未命名';
}

/** 生成规范化文件名：{分类}_{显示名}_{3位编号}.stl */
export function generateCategoryFilename(category: string, displayName: string, index: number): string {
  const safeCategory = category.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  const safeName = displayName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  const num = String(index).padStart(3, '0');
  return `${safeCategory}_${safeName}_${num}.stl`;
}

/** 搜索结果排序优先级（免费排前面） */
export function resultPriority(result: {
  downloadMode?: string;
  verifiedFree?: boolean;
  isLocal?: boolean;
  isTip?: boolean;
  isRecommendedSite?: boolean;
}): number {
  if (result.isTip) return -2;
  if (result.isLocal) return -1;
  const mode = result.downloadMode || '';
  switch (mode) {
    case 'direct': return result.verifiedFree ? 0 : 1;
    case 'resolve': return result.verifiedFree ? 2 : 3;
    case 'detail': return 4;
    case 'external_search': return 8;
    case 'login_required': return 6;
    case 'paid': return 7;
    default: return 5;
  }
}
