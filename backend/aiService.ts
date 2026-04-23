import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { VolunteerProfile, NeedEntity } from '../shared/types';
import dotenv from 'dotenv';
dotenv.config();

// Initialize the correct Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy-key');

export class AIService {
  
  static async extractNeed(text: string, base64Image?: string): Promise<Partial<NeedEntity> | null> {
    const prompt = `
      You are an emergency response AI. Extract distress signal data from the input.
      Understand mixed languages (Hinglish/Hindi/Bengali/Tamil/etc.).
      
      Output JSON strictly matching this schema:
      {
        "location": { "name": string, "lat": number, "lng": number },
        "crisisType": "food" | "medical" | "shelter" | "water" | "infrastructure",
        "urgencyReasoning": string,
        "originalLanguage": string,
        "estimatedScale": number
      }

      Input: "${text}"
    `;

    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash',
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
              estimatedScale: { type: SchemaType.NUMBER }
            },
            required: ['location', 'crisisType', 'urgencyReasoning']
          }
        }
      });

      const parts: any[] = [{ text: prompt }];
      if (base64Image) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image
          }
        });
      }

      const response = await model.generateContent(parts);
      const result = JSON.parse(response.response.text());
      return result;
    } catch (e: any) {
      if (e.status === 429) {
        console.warn('⚠️ Gemini Quota Exceeded (429). Returning null for fallback handling.');
        return null;
      }
      console.error('Gemini extraction failed:', e);
      throw e; 
    }
  }

  static async transcribeAudio(base64Audio: string): Promise<string | null> {
    const prompt = `Transcribe the spoken words in this audio clip exactly. Return only the transcription as plain text, nothing else.`;

    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash',
      });

      const parts = [
        { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
        { text: prompt }
      ];

      const response = await model.generateContent(parts);
      return response.response.text();
    } catch (e: any) {
      if (e.status === 429) {
        console.warn('⚠️ Gemini Quota hit during audio transcription (429). Returning null.');
        return null;
      }
      console.error('Audio transcription failed:', e);
      return null;
    }
  }

  static async getEmbedding(text: string): Promise<number[]> {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (e) {
      console.error('Embedding failed:', e);
      throw e;
    }
  }

  static async generateDispatchMessage(volunteer: VolunteerProfile, need: NeedEntity): Promise<string> {
    const prompt = `
      Compose a short WhatsApp message to dispatch volunteer ${volunteer.name}. 
      Strictly format the output EXACTLY like this (translate to ${volunteer.preferredLanguage} if it's not English):
      "Hi ${volunteer.name}, there's a ${need.crisisType} emergency near ${need.location.name}. Your ${volunteer.skills[0]} expertise is urgently needed."
    `;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const response = await model.generateContent(prompt);
      return response.response.text();
    } catch (e) {
      console.error('Dispatch generation failed:', e);
      return `Emergency: ${need.crisisType} at ${need.location.name}. Urgent help needed!`;
    }
  }

  static async askAssistant(messages: any[], contextData: any): Promise<string> {
    const userQuery = messages[messages.length - 1].content.toLowerCase();
    
    // 1. CLOUD INTELLIGENCE (Priority)
    const modelsToTry = [
      'gemini-2.0-flash', 
      'gemini-flash-latest',
      'gemini-pro-latest'
    ];

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `You are a crisis coordination AI. Context: ${JSON.stringify(contextData)}. User: ${messages[messages.length-1].content}`;
        const response = await model.generateContent(prompt);
        const text = response.response.text();
        if (text) return text;
      } catch (e: any) {
        console.warn(`Cloud attempt (${modelName}) failed: ${e.message}`);
        continue;
      }
    }

    // 2. SAFETY NET (LHI Fallback)
    const incidents = contextData.activeIncidents || [];
    const volunteers = contextData.volunteers || [];
    
    if (userQuery.includes('volunteer')) {
      const avail = volunteers.filter((v: any) => v.available).length;
      return `Currently, there are ${avail} volunteers available for dispatch. Coordination focuses on cities like ${[...new Set(volunteers.slice(0,5).map((v:any)=>v.city))].join(', ')}.`;
    }

    if (userQuery.includes('urgent') || userQuery.includes('area') || userQuery.includes('help')) {
      const top = incidents.sort((a:any, b:any) => b.score - a.score)[0];
      return top 
        ? `The most critical incident is in ${top.loc} (Severity: ${top.score}). It is categorized as a ${top.type} emergency requiring immediate attention.`
        : "All clear. No active crises detected in the live data stream.";
    }

    if (userQuery.includes('summarize') || userQuery.includes('summary') || userQuery.includes('crises')) {
      const types = [...new Set(incidents.map((i:any)=>i.type))];
      return `[Local Summary] There are ${incidents.length} active incidents. Types involved: ${types.join(', ')}. Most critical locations: ${incidents.slice(0,3).map((i:any)=>i.loc).join(', ')}.`;
    }

    return "[Local Intelligence Fallback] My cloud brain is currently resting due to high traffic, but my local scanners show " + incidents.length + " active crises and " + volunteers.filter((v:any)=>v.available).length + " available volunteers. What specific metric can I look up for you in the database?";
  }

  static async getPredictions(incidents: any[]): Promise<any[]> {
    const prompt = `
      You are a crisis prediction AI for India. Analyze these current active crises and their patterns:
      ${JSON.stringify(incidents)}

      Based on: crisis clustering by city, time patterns, types of crises already occurring, seasonal factors for India in April, and historical escalation patterns — predict the TOP 3 cities or areas most likely to report a NEW crisis in the next 6 hours.
      
      Output JSON strictly matching this schema:
      [
        {
          "city": string,
          "predictedCrisisType": "flood" | "fire" | "medical" | "shelter" | "water" | "infrastructure",
          "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
          "confidenceScore": number (0-100),
          "reasoning": string (1 sentence),
          "recommendedPreventiveAction": string (1 sentence)
        }
      ]
    `;

    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash',
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      const response = await model.generateContent(prompt);
      const result = JSON.parse(response.response.text());
      return result;
    } catch (e: any) {
      console.error('Gemini prediction failed:', e);
      // Fallback/Mock predictions for demo
      return [
        {
          "city": "Mumbai",
          "predictedCrisisType": "flood",
          "riskLevel": "HIGH",
          "confidenceScore": 85,
          "reasoning": "Early monsoon patterns and current drainage reports suggest high flooding risk in suburban areas.",
          "recommendedPreventiveAction": "Pre-position water pumps and alert local rescue teams."
        },
        {
          "city": "Delhi",
          "predictedCrisisType": "fire",
          "riskLevel": "MEDIUM",
          "confidenceScore": 65,
          "reasoning": "Rising temperatures and current power grid stress indicate potential fire hazards in industrial clusters.",
          "recommendedPreventiveAction": "Initiate fire safety audits and mobilize water tankers."
        },
        {
          "city": "Bengaluru",
          "predictedCrisisType": "medical",
          "riskLevel": "LOW",
          "confidenceScore": 45,
          "reasoning": "Localized water contamination reports may lead to a minor spike in gastrointestinal cases.",
          "recommendedPreventiveAction": "Distribute ORS packets and monitor local clinic data."
        }
      ];
    }
  }
}
