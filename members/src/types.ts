// D1 の行の型（主要テーブル）。
export interface Association {
  id: string; code: string; name: string; annual_fee: number; fiscal_year_start_month: number; sort_order: number;
  reg_note: string | null; bank_info: string | null; paypay_info: string | null; stripe_account: string | null;
}
export interface Club { id: string; name: string; area: string | null }
export interface Member {
  id: string; member_no: string | null; name: string; kana: string; family_name: string; given_name: string; family_kana: string; given_kana: string; sex: string | null; birth_year: number | null; birth_month: number | null;
  email_hash: string | null; email_enc: string | null; phone_enc: string | null; postal_enc: string | null; address_enc: string | null;
  club_id: string | null; home_association_id: string | null; club_manager: number; status: string;
  withdrawn_at: string | null; contacts_purged_at: string | null; merged_into: string | null; consented_at: string | null;
  created_at: string; updated_at: string;
}
export interface Registration {
  id: string; member_id: string; association_id: string; fiscal_year: number; category: string; fee: number;
  payment_id: string | null; status: string; source: string; approved_by: string | null; approved_at: string | null; created_at: string;
}
export interface TournamentEvent { code: string; name: string; classes: string[]; fee: number; teamSize: number }
export interface Tournament {
  id: string; association_id: string; name: string; held_on: string; venue: string | null; entry_start: string; entry_end: string;
  eligibility: string | null; requires_registration: number; eligibility_json: string; partner_rule: string; events_json: string; payment_methods_json: string;
  unpaid_policy: string; capacity: number | null; status: string; created_at: string;
}
export interface Entry {
  id: string; tournament_id: string; event_code: string; class: string | null; member_id: string; partner_member_id: string | null;
  source: string; payment_id: string | null; status: string; created_by: string | null; created_at: string;
  confirmed_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
}
export interface Payment {
  id: string; kind: string; association_id: string; payer_member_id: string | null; amount: number; method: string;
  external_id: string | null; status: string; paid_at: string | null; confirmed_by: string | null; receipt_no: string | null;
  note: string | null; created_at: string;
}
export type Role = 'sysadmin' | 'assoc_admin' | 'tournament' | 'viewer' | 'shop';
export interface Admin {
  id: string; email: string; name: string; association_id: string | null; role: Role; tournament_ids_json: string; active: number; created_at: string;
}
export type PaymentMethod = 'stripe' | 'bank' | 'paypay' | 'cash';

export const METHOD_LABEL: Record<string, string> = { stripe: 'Stripe（カード・コンビニ・振込）', bank: '銀行振込', paypay: 'PayPay', cash: 'テニスショップで現金' };
export const ROLE_LABEL: Record<string, string> = { sysadmin: 'システム管理者', assoc_admin: '協会管理', tournament: '大会運営', viewer: '閲覧', shop: 'ショップ' };
export const CATEGORY_LABEL: Record<string, string> = { general: '一般', student: '学生', junior: 'ジュニア', senior: 'シニア' };
export const STATUS_LABEL: Record<string, string> = {
  pending: '承認待ち', approved: '承認済み', rejected: '却下',
  pending_payment: '支払待ち', confirmed: '確定', cancelled: 'キャンセル',
  paid: '入金済み', refunded: '返金', draft: '下書き', open: '受付中', closed: '締切',
  active: '会員', provisional: '仮会員', withdrawn: '退会',
};
export const SEX_LABEL: Record<string, string> = { male: '男', female: '女', other: 'その他' };
