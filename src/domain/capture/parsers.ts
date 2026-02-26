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

export const extractShopIdFromUrl = (url: string): string | null => {
  try {
    const normalized = url.startsWith("//") ? `https:${url}` : url
    const parsed = new URL(normalized, "https://buyin.jinritemai.com")
    const shopId = parsed.searchParams.get("shop_id")
    return shopId ? String(shopId) : null
  } catch {
    return null
  }
}

export const extractContactFields = (
  body: unknown
): { phone?: string | null; wechat?: string | null } => {
  if (!body || typeof body !== "object") return {}
  const parsed = body as {
    shop_contact?: { phone?: string | number; wechat?: string | number }
    data?: { shop_contact?: { phone?: string | number; wechat?: string | number } }
  }
  const contact = parsed.shop_contact ?? parsed.data?.shop_contact
  if (!contact) return {}
  const phone =
    contact.phone === undefined || contact.phone === null
      ? null
      : String(contact.phone)
  const wechat =
    contact.wechat === undefined || contact.wechat === null
      ? null
      : String(contact.wechat)
  return { phone, wechat }
}

export const extractDetailFields = (body: unknown) => {
  if (!body || typeof body !== "object") return {}
  const parsed = body as {
    shop_detail?: Record<string, unknown>
    data?: { shop_detail?: Record<string, unknown> }
  }
  const detail = parsed.shop_detail ?? parsed.data?.shop_detail
  if (!detail || typeof detail !== "object") return {}
  const getValue = (key: string) => {
    const value = (detail as Record<string, unknown>)[key]
    if (value === undefined || value === null) return undefined
    return value
  }
  return {
    shop_id: getValue("shop_id"),
    shop_name: getValue("shop_name"),
    experience_score: getValue("experience_score"),
    product_experience_score: getValue("product_experience_score"),
    logistics_score: getValue("logistics_score"),
    shop_service_score: getValue("shop_service_score"),
    coo_kol_num: getValue("coo_kol_num"),
    sales: getValue("sales"),
    avg_cos_ratio: getValue("avg_cos_ratio")
  }
}

export const resolveCaptureGroup = (url: string): CaptureGroupKey | null => {
  if (url.includes("/connection/pc/im/shop/contact")) return "contact"
  if (url.includes("/connection/pc/im/shop/detail")) return "detail"
  return null
}
