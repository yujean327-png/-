import { GoogleGenAI, Type } from "@google/genai";
import { Subtitle, SentenceExplanation } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function extractSubtitles(videoBase64: string, mimeType: string): Promise<Subtitle[]> {
  const ai = getAI();
  // Using Flash for speed as requested
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: videoBase64,
              mimeType: mimeType,
            },
          },
          {
            text: "请观看此视频并提取所有日语字幕及其开始时间戳。时间戳格式必须严格遵守：1小时10分0秒表示为1:10:00，如果没有小时则为分:秒（如1:20）。仅返回JSON数组，包含timestamp和text字段。",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            timestamp: { type: Type.STRING },
            text: { type: Type.STRING },
          },
          required: ["timestamp", "text"],
        },
      },
    },
  });

  return JSON.parse(response.text || "[]");
}

export async function explainSentence(text: string, context?: string): Promise<SentenceExplanation> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview", 
    contents: `请详细讲解以下日语句子： "${text}"。
    上下文：${context || "无"}。
    要求：
    1. 语法讲解：以要点形式提供。
    2. 词汇讲解：包含单词、平假名读音、意思和词性。
    请严格按照JSON格式返回。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          grammar: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                point: { type: Type.STRING, description: "语法点" },
                explanation: { type: Type.STRING, description: "详细解释" },
              },
              required: ["point", "explanation"],
            },
          },
          vocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                reading: { type: Type.STRING, description: "平假名读音" },
                meaning: { type: Type.STRING },
                category: { type: Type.STRING },
              },
              required: ["word", "reading", "meaning", "category"],
            },
          },
        },
        required: ["grammar", "vocabulary"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}
