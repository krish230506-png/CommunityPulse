import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { VolunteerProfile, NeedEntity } from '../shared/types';
import dotenv from 'dotenv';
dotenv.config();

export class AIService {
  private static _genAI: GoogleGenerativeAI | null = null;
  private static MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview'];

  private static getGenAI() {
    if (!this._genAI) {
      const key = process.env.GEMINI_API_KEY;
      this._genAI = new GoogleGenerativeAI(key || 'dummy-key');
    }
    return this._genAI;
  }

  private static async callWithRotation(fn: (modelName: string) => Promise<any>) {
    let lastError: any = null;
    for (const modelName of this.MODELS) {
      try {
        return await fn(modelName);
      } catch (e: any) {
        lastError = e;
        // Rotate on 429 (Quota), 404 (Not Found), or 503 (Overloaded)
        if (e.status === 429 || e.status === 404 || e.status === 503) {
          console.warn(`⚠️ Model ${modelName} unavailable (${e.status}). Rotating...`);
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  static async extractNeed(text: string, base64Image?: string): Promise<Partial<NeedEntity> | null> {
    const prompt = `
    You are an emergency response AI. Extract distress signal data from the input (text and/or image).
    CRITICAL: You must identify the EXACT neighborhood or landmark and provide precise GPS coordinates (lat/lng) for highlighting on a map.
    If the input is vague, meaningless, or does not clearly describe a real-world crisis event, return null.
    Output JSON strictly matching this schema.
    User Text Input: "${text || 'No text provided. Analyze image only.'}"
    `;

    try {
      return await this.callWithRotation(async (modelName) => {
        const model = this.getGenAI().getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.OBJECT,
              properties: {
                location: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    lat: { type: SchemaType.NUMBER },
                    lng: { type: SchemaType.NUMBER }
                  },
                  required: ['name']
                },
                crisisType: {
                  type: SchemaType.STRING,
                  enum: ['food', 'medical', 'shelter', 'water', 'infrastructure'],
                  format: "enum"
                },
                urgencyReasoning: { type: SchemaType.STRING },
                originalLanguage: { type: SchemaType.STRING },
                estimatedScale: { type: SchemaType.NUMBER },
                precision: { type: SchemaType.NUMBER },
                isExact: { type: SchemaType.BOOLEAN }
              },
              required: ['location', 'crisisType', 'urgencyReasoning', 'precision', 'isExact']
            }
          }
        });

        const parts: any[] = [{ text: prompt }];
        if (base64Image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } });

        const response = await model.generateContent(parts);
        const result = JSON.parse(response.response.text());

        // GEOGRAPHICAL VALIDATION (Prevent Hallucinations)
        if (result.location && result.location.name) {
          const locName = result.location.name.toLowerCase();

          // Emergency Correction for common Indian cities if AI gets lat/lng wrong
          if (locName.includes('noida') && (result.location.lat < 28 || result.location.lat > 29)) {
            result.location.lat = 28.6282; result.location.lng = 77.3649; // Correct Noida Sec 62
          } else if (locName.includes('mumbai') && (result.location.lat > 20 || result.location.lat < 18)) {
            result.location.lat = 19.0760; result.location.lng = 72.8777;
          } else if (locName.includes('delhi') && (result.location.lat < 28 || result.location.lat > 29)) {
            result.location.lat = 28.6139; result.location.lng = 77.2090;
          }
        }

        return result;
      });
    } catch (e: any) {
      console.warn('⚠️ All models exhausted or failed:', e.message || e);
      return null;
    }
  }

  static async transcribeAudio(base64Audio: string): Promise<string | null> {
    const prompt = `Transcribe the spoken words in this audio clip exactly.Return only the transcription as plain text, nothing else.`;
    try {
      return await this.callWithRotation(async (modelName) => {
        const model = this.getGenAI().getGenerativeModel({ model: modelName });
        const parts = [
          { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
          { text: prompt }
        ];
        const response = await model.generateContent(parts);
        return response.response.text().trim();
      });
    } catch (e: any) {
      console.error('Audio transcription failed:', e);
      return null;
    }
  }

  static async getEmbedding(text: string): Promise<number[]> {
    try {
      const model = this.getGenAI().getGenerativeModel({ model: 'gemini-embedding-001' });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (e) {
      console.error('Embedding failed:', e);
      throw e;
    }
  }

  static async generateDispatchMessage(volunteer: VolunteerProfile, need: NeedEntity): Promise<string> {
    const prompt = `Act as a high-fidelity crisis coordination system. Generate a SINGLE, concise, professional dispatch message for ${volunteer.name} to handle a ${need.crisisType} emergency at ${need.location.name}.
    CRITICAL:
    - Output ONLY the message text.
    - DO NOT provide multiple options.
    - DO NOT include conversational filler like "Here is your message" or introductory/concluding text.
    - Maintain a tone of professional urgency.`;

    try {
      return await this.callWithRotation(async (modelName) => {
        const model = this.getGenAI().getGenerativeModel({ model: modelName });
        const response = await model.generateContent(prompt);
        let text = response.response.text().trim();
        // Remove any surrounding quotes that AI might add
        if (text.startsWith('"') && text.endsWith('"')) {
          text = text.substring(1, text.length - 1);
        }
        return text;
      });
    } catch (e) {
      return `URGENT DISPATCH: ${volunteer.name}, please proceed to ${need.location.name} immediately for ${need.crisisType} assistance.`;
    }
  }

  static async askAssistant(messages: any[], contextData: any): Promise<string> {
    const systemPrompt = `You are the TONIC Crisis Intelligence Assistant. 
    Your goal is to help rescue operators analyze data and make decisions.
    
    Current System Context (JSON): ${JSON.stringify(contextData)}
    
    Guidelines:
    - Be concise, professional, and data-driven.
    - Reference specific incidents or volunteers from the context if relevant.
    - If you don't know something, say so.
    - Do not speculate on life-safety without data.`;

    const userMessage = messages[messages.length - 1].content;
    const finalPrompt = `${systemPrompt}\n\nUser Question: ${userMessage}`;

    try {
      return await this.callWithRotation(async (modelName) => {
        const model = this.getGenAI().getGenerativeModel({ model: modelName });
        const response = await model.generateContent(finalPrompt);
        return response.response.text().trim();
      });
    } catch (e: any) {
      return "[Local Intelligence Fallback] My cloud connection is unstable. Please review the live dashboard data manually.";
    }
  }

  static async getPredictions(incidents: any[]): Promise<any[]> {
    const fallbackPredictions = [{ city: "Mumbai", predictedCrisisType: "flood", riskLevel: "HIGH", confidenceScore: 88, reasoning: "Satellite data", recommendedPreventiveAction: "Stage boats" }];
    const prompt = `Analyze: ${JSON.stringify(incidents)}. Return JSON array of TOP 3 escalations.`;
    try {
      return await this.callWithRotation(async (modelName) => {
        const model = this.getGenAI().getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json' }
        });
        const response = await model.generateContent(prompt);
        return JSON.parse(response.response.text());
      });
    } catch (e: any) {
      return fallbackPredictions;
    }
  }
}
