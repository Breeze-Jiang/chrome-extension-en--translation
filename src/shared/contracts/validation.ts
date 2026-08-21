/**
 * 契约边界校验使用的基础类型守卫。
 * 外部载荷一律先视为 unknown，在进入领域层前完成校验。
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
