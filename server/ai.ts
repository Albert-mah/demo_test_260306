// ============================================================
// Gemini AI Service — Server Side
// ============================================================

// Proxy setup (must be before any fetch calls)
import { ProxyAgent, setGlobalDispatcher } from 'undici';
const _proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (_proxy) setGlobalDispatcher(new ProxyAgent(_proxy));

import { GoogleGenAI } from '@google/genai';

// Lazy init — env vars are set by dotenv in index.ts before any AI call happens
let _ai: GoogleGenAI | null = null;
function getAI() {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY || '' });
  }
  return _ai;
}

function getModelFast() { return process.env.VITE_GEMINI_MODEL_FAST || 'gemini-3-flash-preview'; }
function getModelLite() { return process.env.VITE_GEMINI_MODEL_LITE || 'gemini-3.1-flash-lite-preview'; }
function getModelPro() { return process.env.VITE_GEMINI_MODEL_PRO || 'gemini-3.1-pro-preview'; }

export type ModelTier = 'fast' | 'lite' | 'pro';

function getModel(tier: ModelTier) {
  switch (tier) {
    case 'lite': return getModelLite();
    case 'pro': return getModelPro();
    default: return getModelFast();
  }
}

export interface AICallResult {
  text: string;
  model: string;
  tokens_used: number;
  duration_ms: number;
}

export async function callGemini(prompt: string, tier: ModelTier = 'fast'): Promise<AICallResult> {
  const model = getModel(tier);
  const start = performance.now();

  const response = await getAI().models.generateContent({
    model,
    contents: prompt,
  });

  const duration_ms = Math.round(performance.now() - start);
  const text = response.text ?? '';
  const tokens_used = response.usageMetadata?.totalTokenCount ?? 0;

  return { text, model, tokens_used, duration_ms };
}

// ---- Specialized AI functions ----

export async function translateText(text: string, targetLang = '中文'): Promise<AICallResult> {
  return callGemini(
    `将以下文本翻译为${targetLang}，只输出翻译结果，不加任何解释或标注：\n\n${text}`,
    'fast',
  );
}

export async function detectLanguage(text: string): Promise<string> {
  const r = await callGemini(
    `判断以下文本的语言，只输出语言名称（如"英语"、"日语"、"德语"），不加任何解释：\n\n${text.slice(0, 200)}`,
    'lite',
  );
  return r.text.trim();
}

export async function classifyTicket(content: string): Promise<AICallResult> {
  return callGemini(
    `你是工单分类系统。只输出一个分类标签：设备维修 | 软件问题 | 账户问题 | 功能咨询 | 投诉建议 | 许可证问题 | 数据问题 | 其他

工单内容：
${content}`,
    'lite',
  );
}

export async function assessPriority(content: string, category: string): Promise<AICallResult> {
  return callGemini(
    `只输出优先级：P1-紧急 | P2-高 | P3-中 | P4-低

分类：${category}
内容：${content}`,
    'lite',
  );
}

export async function generateTicketReply(
  ticketContent: string,
  customerLang: string,
  knowledgeContext?: string,
): Promise<AICallResult> {
  const kb = knowledgeContext ? `\n参考知识库：\n${knowledgeContext}\n` : '';
  return callGemini(
    `你是专业客服。为以下工单生成回复，同时提供${customerLang}版本和中文版本。
${kb}
工单内容：
${ticketContent}

格式：
=== ${customerLang} ===
（正式回复）

=== 中文 ===
（对应中文）`,
    'fast',
  );
}

export async function replyFromIntent(
  ticketContent: string,
  customerLang: string,
  userIntent: string,
): Promise<AICallResult> {
  return callGemini(
    `你是客服回复助手。根据客服的中文大意，用${customerLang}写正式回复。

客户工单：
${ticketContent}

客服想表达：
${userIntent}

格式：
=== ${customerLang} ===
（正式回复）

=== 中文 ===
（对应中文翻译）`,
    'fast',
  );
}

export async function analyzeForKnowledge(
  content: string,
  resolution: string,
): Promise<AICallResult> {
  return callGemini(
    `分析已解决工单的知识积累价值。输出 JSON：
{
  "worth_action": true/false,
  "reason": "原因",
  "suggested_action": "knowledge_base" | "user_manual" | "none",
  "summary": "知识摘要",
  "category": "分类"
}

工单内容：${content}
解决方案：${resolution}`,
    'fast',
  );
}

export async function investigateCustomer(name: string, country: string, info?: string): Promise<AICallResult> {
  const extra = info ? `\n已知信息：${info}` : '';
  return callGemini(
    `调查客户背景并输出报告。包含：公司简介、行业、规模、价值评估(高/中/低)、风险点。
${extra}
客户：${name}
地区：${country}`,
    'fast',
  );
}

export async function analyzeVoucher(
  voucherText: string,
  orderData: { orderId: string; amount: number; currency: string; customerName: string },
): Promise<AICallResult> {
  return callGemini(
    `分析转账凭证与订单是否匹配。输出 JSON：
{
  "match": true/false,
  "confidence": 0-100,
  "voucher_amount": "金额",
  "voucher_payer": "付款人",
  "discrepancies": [],
  "recommendation": "建议"
}

凭证：${voucherText}
订单：${orderData.orderId} / ${orderData.currency} ${orderData.amount} / ${orderData.customerName}`,
    'fast',
  );
}

export async function summarizeEmails(
  emails: { from: string; date: string; subject: string; body: string }[],
): Promise<AICallResult> {
  const text = emails.map((e, i) =>
    `[${i + 1}] ${e.from} (${e.date}) — ${e.subject}\n${e.body}`
  ).join('\n\n');
  return callGemini(`总结以下邮件往来，提取关键信息和待办：\n\n${text}`, 'fast');
}

export async function askAboutEmails(
  emails: { from: string; date: string; subject: string; body: string }[],
  question: string,
): Promise<AICallResult> {
  const text = emails.map((e, i) =>
    `[${i + 1}] ${e.from} (${e.date}) — ${e.subject}\n${e.body}`
  ).join('\n\n');
  return callGemini(`基于以下邮件回答问题。\n\n邮件：\n${text}\n\n问题：${question}`, 'fast');
}
