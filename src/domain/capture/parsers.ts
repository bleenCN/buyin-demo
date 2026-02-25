import type { CaptureGroupKey } from "~domain/capture/types"

export const extractShopIds = (body: unknown): string[] => {
  if (!body || typeof body !== "object") return []
  const data = body as {
    data?: {
      summary_promotions?: Array<{
        base_model?: { shop_info?: { shop_id?: string | number } }
      }>
    }
  }
  const list = data.data?.summary_promotions ?? []
  return list
    .map((item) => item?.base_model?.shop_info?.shop_id)
    .filter((value): value is string | number => value !== undefined)
    .map((value) => String(value))
}

export const extractBuyinId = (body: unknown): string | null => {
  if (!body || typeof body !== "object") return null
  const parsed = body as { data?: { buyin_account_id?: string | number } }
  const buyinId = parsed.data?.buyin_account_id
  if (buyinId === undefined || buyinId === null) return null
  return String(buyinId)
}

export const resolveCaptureGroup = (url: string): CaptureGroupKey | null => {
  if (url.includes("/connection/pc/im/shop/contact")) return "contact"
  if (url.includes("/connection/pc/im/shop/detail")) return "detail"
  return null
}
