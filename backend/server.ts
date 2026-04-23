import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import { AIService } from './aiService';
import { processDeduplication, haversineDistance } from './deduplication';
import { db } from './firebaseDb';
import { NeedEntity } from '../shared/types';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Setup Multer for basic file uploads (in-memory for the demo)
const upload = multer({ storage: multer.memoryStorage() });

// Smart local keyword extractor — used as fallback when Gemini quota is exhausted
function smartLocalExtract(text: string): Partial<any> | null {
  const t = text.toLowerCase();

  // Crisis type detection
  let crisisType = 'medical';
  if (/flood|water|rain|tanker|river|drowning|drain|submerged/.test(t)) crisisType = 'water';
  else if (/food|hungry|starv|eat|ration|packet|grocery|meal/.test(t)) crisisType = 'food';
  else if (/shelter|tent|roof|homeless|displaced|house|stay|live/.test(t)) crisisType = 'shelter';
  else if (/road|bridge|sinkhole|collapse|building|debris|rubble|infra|crack|falling/.test(t)) crisisType = 'infrastructure';
  else if (/fire|medical|doctor|hospital|injured|ambulance|sick|hurt|trapped|blood|patient|emergency/.test(t)) crisisType = 'medical';
  else return null; // No crisis type found

  // Location detection (Mumbai landmarks)
  const locationMap: Record<string, { lat: number; lng: number }> = {
    'gateway of india': { lat: 18.9220, lng: 72.8347 },
    'dharavi': { lat: 19.0422, lng: 72.8538 },
    'juhu': { lat: 19.0990, lng: 72.8267 },
    'bandra': { lat: 19.0596, lng: 72.8295 },
    'andheri': { lat: 19.1136, lng: 72.8697 },
    'marine drive': { lat: 18.9430, lng: 72.8235 },
    'dadar': { lat: 19.0178, lng: 72.8478 },
    'kurla': { lat: 19.0726, lng: 72.8845 },
    'worli': { lat: 19.0168, lng: 72.8171 },
    'colaba': { lat: 18.9068, lng: 72.8148 },
    'borivali': { lat: 19.2307, lng: 72.8567 },
    'thane': { lat: 19.2183, lng: 72.9781 },
    'navi mumbai': { lat: 19.0330, lng: 73.0297 },
    'powai': { lat: 19.1176, lng: 72.9060 },
    'chembur': { lat: 19.0622, lng: 72.8974 },
    'malad': { lat: 19.1874, lng: 72.8484 },
    'ghatkopar': { lat: 19.0884, lng: 72.9125 },
    'sion': { lat: 19.0390, lng: 72.8619 },
    'mumbai': { lat: 19.0760, lng: 72.8777 },
    // Delhi Landmarks
    'india gate': { lat: 28.6129, lng: 77.2295 },
    'connaught place': { lat: 28.6315, lng: 77.2167 },
    'cp': { lat: 28.6315, lng: 77.2167 },
    'chandni chowk': { lat: 28.6506, lng: 77.2300 },
    'hauz khas': { lat: 28.5494, lng: 77.2001 },
    'saket': { lat: 28.5204, lng: 77.2131 },
    'dwarka': { lat: 28.5823, lng: 77.0500 },
    'rohini': { lat: 28.7158, lng: 77.1139 },
    'karol bagh': { lat: 28.6550, lng: 77.1888 },
    'delhi': { lat: 28.6139, lng: 77.2090 },
    'new delhi': { lat: 28.6139, lng: 77.2090 },
    // Major Indian Cities
    'bangalore': { lat: 12.9716, lng: 77.5946 },
    'bengaluru': { lat: 12.9716, lng: 77.5946 },
    'hyderabad': { lat: 17.3850, lng: 78.4867 },
    'chennai': { lat: 13.0827, lng: 80.2707 },
    'kolkata': { lat: 22.5726, lng: 88.3639 },
    'pune': { lat: 18.5204, lng: 73.8567 },
    'ahmedabad': { lat: 23.0225, lng: 72.5714 },
    'jaipur': { lat: 26.9124, lng: 75.7873 },
    'lucknow': { lat: 26.8467, lng: 80.9462 },
    'kanpur': { lat: 26.4499, lng: 80.3319 },
    'nagpur': { lat: 21.1458, lng: 79.0882 },
    'indore': { lat: 22.7196, lng: 75.8577 },
    'patna': { lat: 25.5941, lng: 85.1376 },
    'bhopal': { lat: 23.2599, lng: 77.4126 },
    'surat': { lat: 21.1702, lng: 72.8311 },
    'vizag': { lat: 17.6868, lng: 83.2185 },
    'visakhapatnam': { lat: 17.6868, lng: 83.2185 },
    'noida': { lat: 28.5355, lng: 77.3910 },
    'gurgaon': { lat: 28.4595, lng: 77.0266 },
    'gurugram': { lat: 28.4595, lng: 77.0266 },
    'chandigarh': { lat: 30.7333, lng: 76.7794 },
    'kochi': { lat: 9.9312, lng: 76.2673 },
    // Tier-2 & Tier-3 Regional Hubs (including Rohtak level)
    'rohtak': { lat: 28.8955, lng: 76.6066 },
    'panipat': { lat: 29.3909, lng: 76.9635 },
    'sonipat': { lat: 28.9931, lng: 77.0151 },
    'hisar': { lat: 29.1492, lng: 75.7217 },
    'ludhiana': { lat: 30.9010, lng: 75.8573 },
    'amritsar': { lat: 31.6340, lng: 74.8723 },
    'varanasi': { lat: 25.3176, lng: 82.9739 },
    'meerut': { lat: 28.9845, lng: 77.7064 },
    'agra': { lat: 27.1767, lng: 78.0081 },
    'ghaziabad': { lat: 28.6692, lng: 77.4538 },
    'ranchi': { lat: 23.3441, lng: 85.3096 },
    'raipur': { lat: 21.2514, lng: 81.6296 },
    'bhubaneswar': { lat: 20.2961, lng: 85.8245 },
    'guwahati': { lat: 26.1158, lng: 91.7086 },
    'shimla': { lat: 31.1048, lng: 77.1734 },
    'dehradun': { lat: 30.3165, lng: 78.0322 },
    'jammu': { lat: 32.7266, lng: 74.8570 },
    'srinagar': { lat: 34.0837, lng: 74.7973 },
    'aurangabad': { lat: 19.8762, lng: 75.3433 },
    'nashik': { lat: 19.9975, lng: 73.7898 },
    'coimbatore': { lat: 11.0168, lng: 76.9558 },
    'madurai': { lat: 9.9252, lng: 78.1198 },
    'mysore': { lat: 12.2958, lng: 76.6394 },
    'faridabad': { lat: 28.4089, lng: 77.3178 },
    'karnal': { lat: 29.6857, lng: 76.9905 },
    'ambala': { lat: 30.3752, lng: 76.7821 },
    'bhiwani': { lat: 28.7931, lng: 76.1396 },
    'bareilly': { lat: 28.3670, lng: 79.4304 },
    'aligarh': { lat: 27.8974, lng: 78.0880 },
    'moradabad': { lat: 28.8386, lng: 78.7733 },
    'saharanpur': { lat: 29.9640, lng: 77.5460 },
    'gorakhpur': { lat: 26.7606, lng: 83.3732 },
    'jhansi': { lat: 25.4484, lng: 78.5685 },
    'prayagraj': { lat: 25.4358, lng: 81.8463 },
    'jodhpur': { lat: 26.2389, lng: 73.0243 },
    'kota': { lat: 25.2138, lng: 75.8648 },
    'bikaner': { lat: 28.0229, lng: 73.3119 },
    'ajmer': { lat: 26.4499, lng: 74.6399 },
    'udaipur': { lat: 24.5854, lng: 73.7125 },
    'jalandhar': { lat: 31.3260, lng: 75.5762 },
    'patiala': { lat: 30.3398, lng: 76.3869 },
    'bathinda': { lat: 30.2110, lng: 74.9455 },
    'gwalior': { lat: 26.2124, lng: 78.1772 },
    'jabalpur': { lat: 23.1815, lng: 79.9864 },
    'ujjain': { lat: 23.1765, lng: 75.7885 },
    'sagar': { lat: 23.8388, lng: 78.7378 },
    'rewa': { lat: 24.5373, lng: 81.3042 },
    'solapur': { lat: 17.6599, lng: 75.9064 },
    'amravati': { lat: 20.9320, lng: 77.7523 },
    'kolhapur': { lat: 16.7050, lng: 74.2433 },
    'hubli': { lat: 15.3647, lng: 75.1240 },
    'mangalore': { lat: 12.9141, lng: 74.8560 },
    'belgaum': { lat: 15.8497, lng: 74.4977 },
    'vadodara': { lat: 22.3072, lng: 73.1812 },
    'rajkot': { lat: 22.3039, lng: 70.8022 },
    'bhavnagar': { lat: 21.7645, lng: 72.1519 },
    'jamnagar': { lat: 22.4707, lng: 70.0577 },
    'trichy': { lat: 10.7905, lng: 78.7047 },
    'salem': { lat: 11.6643, lng: 78.1460 },
    'vellore': { lat: 12.9165, lng: 79.1325 },
    'vijayawada': { lat: 16.5062, lng: 80.6480 },
    'guntur': { lat: 16.3067, lng: 80.4365 },
    'nellore': { lat: 14.4426, lng: 79.9865 },
    'kurnool': { lat: 15.8281, lng: 78.0373 },
    'warangal': { lat: 17.9689, lng: 79.5941 },
    'nizamabad': { lat: 18.6725, lng: 78.0941 },
    'karimnagar': { lat: 18.4386, lng: 79.1288 },
    'asansol': { lat: 23.6739, lng: 86.9524 },
    'siliguri': { lat: 26.7271, lng: 88.3953 },
    'durgapur': { lat: 23.5204, lng: 87.3119 },
    'kharagpur': { lat: 22.3302, lng: 87.3237 },
    'jamshedpur': { lat: 22.8046, lng: 86.2029 },
    'dhanbad': { lat: 23.7957, lng: 86.4304 },
    'bokaro': { lat: 23.6693, lng: 86.1511 },
    'bhilai': { lat: 21.1938, lng: 81.3509 },
    'bilaspur': { lat: 22.0797, lng: 82.1391 },
    'cuttack': { lat: 20.4625, lng: 85.8830 },
    'rourkela': { lat: 22.2505, lng: 84.8624 },
    'berhampur': { lat: 19.3150, lng: 84.7941 },
    'trivandrum': { lat: 8.5241, lng: 76.9366 },
    'kozhikode': { lat: 11.2588, lng: 75.7804 },
    'thrissur': { lat: 10.5276, lng: 76.2144 },
    'silchar': { lat: 24.8333, lng: 92.7789 },
    'dibrugarh': { lat: 27.4728, lng: 94.9120 },
    'agartala': { lat: 23.8315, lng: 91.2868 },
    'shillong': { lat: 25.5788, lng: 91.8933 },
    'imphal': { lat: 24.8170, lng: 93.9368 },
    'aizawl': { lat: 23.7271, lng: 92.7176 },
    'kohima': { lat: 25.6701, lng: 94.1077 },
    'gujarat': { lat: 23.0225, lng: 72.5714 },
    'kutch': { lat: 23.7337, lng: 69.8597 },
    'odisha': { lat: 20.9517, lng: 85.0985 },
    'balasore': { lat: 21.4934, lng: 86.9337 },
    'rajasthan': { lat: 27.0238, lng: 74.2179 },
    'india': { lat: 20.5937, lng: 78.9629 }, // Center of India
  };

  let locationName = 'Mumbai Metropolitan Area';
  let coords = null;
  for (const [key, val] of Object.entries(locationMap)) {
    if (t.includes(key)) {
      locationName = key.replace(/\b\w/g, c => c.toUpperCase());
      coords = val;
      break;
    }
  }

  if (!coords) return null; // No location found

  // Scale detection
  const scaleMatch = t.match(/(\d+)\s*(people|person|family|families|victims|residents)/);
  const estimatedScale = scaleMatch ? parseInt(scaleMatch[1]) : 10;

  // Urgency reasoning
  const urgencyMap: Record<string, string> = {
    water: `Flooding/water shortage at ${locationName} affecting ~${estimatedScale} people. Immediate water distribution required.`,
    food: `Food scarcity reported at ${locationName} for ~${estimatedScale} people. Ration distribution needed.`,
    shelter: `Displacement event at ${locationName}, ~${estimatedScale} people without shelter.`,
    infrastructure: `Structural hazard at ${locationName}. Area evacuation and engineering assessment required.`,
    medical: `Medical emergency at ${locationName} involving ~${estimatedScale} people. Immediate medical response needed.`,
  };

  return {
    crisisType,
    location: { name: locationName, ...coords },
    urgencyReasoning: urgencyMap[crisisType],
    estimatedScale,
    originalLanguage: /[\u0900-\u097F]/.test(text) ? 'Hindi' : 'English',
  };
}

app.post('/needs/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    await db.resolveNeed(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to resolve need' });
  }
});

// Basic endpoints to fetch data for the frontend
app.get('/needs', async (req, res) => {
  const needs = await db.getAllNeeds();
  // Sort by criticalityScore descending
  needs.sort((a, b) => b.criticalityScore - a.criticalityScore);
  res.json(needs);
});

app.delete('/needs', async (req, res) => {
  try {
    await db.clearAllNeeds();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear needs' });
  }
});

app.get('/volunteers', async (req, res) => {
  const vols = await db.getVolunteers();
  res.json(vols);
});

// PILLAR 1 & 2: Ingestion and Deduplication
app.post('/ingest', upload.single('image'), async (req, res) => {
  try {
    const rawText = req.body.text || '';
    console.log('📥 Incoming Ingest Request. Text:', rawText.substring(0, 50) + '...');

    let base64Image: string | undefined;
    if (req.file) {
      base64Image = req.file.buffer.toString('base64');
      console.log('📸 Image attached.');
    }

    if (!rawText && !base64Image) {
      console.warn('⚠️ Rejected: No text or image provided.');
      return res.status(400).json({ error: 'Provide text or image' });
    }

    // 1. Extract Entity using Gemini (with full fallback)
    let extractedData;
    try {
      console.log('🤖 Calling Gemini AI for extraction...');
      extractedData = await AIService.extractNeed(rawText, base64Image);


      // 🔴 ADD THIS BLOCK RIGHT HERE
      if (extractedData) {
        const meaningfulKeywords = /flood|water|rain|fire|medical|food|shelter|infrastructure|earthquake|accident|emergency|injured|collapse|relief|rescue|trapped|crisis|help|hurt|damage|disaster|death|wound|burn|drown|starv|sick|hospital|ambulance/i;

        const hasLocation = extractedData.location?.lat && extractedData.location?.lng;
        const hasKeyword = meaningfulKeywords.test(rawText || '');
        const hasMinLength = (rawText || '').trim().split(' ').length >= 3;

        if (!hasKeyword && !base64Image && hasMinLength === false) {
          return res.status(422).json({
            error: 'Signal unclear — could not extract crisis data. Please add more detail: location, type, or scale.'
          });
        }

        if (!hasKeyword && !base64Image && !hasLocation) {
          return res.status(422).json({
            error: 'Signal unclear — could not extract crisis data. Please add more detail: location, type, or scale.'
          });
        }
      }
      // 🔴 END BLOCK

      if (!extractedData || !extractedData.crisisType || !extractedData.location) {
        throw new Error('Incomplete data from AI');
      }
    } catch (e) {
      console.warn('⚠️ Gemini unavailable or network error — trying smart local extraction.');
      extractedData = smartLocalExtract(rawText || 'emergency signal');
      if (extractedData) {
        (extractedData as any).isLocal = true;
      }
    }

    if (!extractedData) {
      console.warn('⚠️ Rejected: Signal unclear — could not extract crisis data.');
      return res.status(422).json({ error: 'Signal unclear — could not extract crisis data. Please add more detail: location, type, or scale.' });
    }

    // Prepare full entity
    const locationStr = `${extractedData.crisisType} ${extractedData.location?.name || 'Unknown'} ${extractedData.urgencyReasoning}`;

    // 2. Generate Embedding (graceful fallback if quota hit)
    let embedding: number[];
    try {
      embedding = await AIService.getEmbedding(locationStr);
    } catch (e: any) {
      console.warn('⚠️ Embedding quota hit — using zero vector for dedup.');
      embedding = new Array(768).fill(0).map(() => Math.random() * 0.01);
    }

    const newNeed: NeedEntity = {
      id: crypto.randomUUID(),
      location: {
        name: extractedData.location?.name || 'Unknown Location',
        lat: extractedData.location?.lat || 19.0760,
        lng: extractedData.location?.lng || 72.8777
      },
      crisisType: (extractedData.crisisType || 'medical') as any,
      urgencyReasoning: extractedData.urgencyReasoning || 'Immediate assistance required.',
      estimatedScale: extractedData.estimatedScale || 1,
      reportCount: 1,
      criticalityScore: 0, // Calculated in dedup
      status: 'OPEN',
      reportedAt: Date.now(),
      rawInputs: [rawText],
      embedding,
      originalLanguage: extractedData.originalLanguage,
      isLocal: (extractedData as any).isLocal || false
    };

    // 3. Deduplication + Velocity calculation
    const processedNeed = await processDeduplication(newNeed);

    res.json(processedNeed);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PILLAR 1-Audio: Voice Reporting
// Strategy: Transcribe audio to text first, then let frontend route through normal /ingest
app.post('/ingest-audio', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { base64Audio } = req.body;
    if (!base64Audio) return res.status(400).json({ error: 'Missing base64Audio content' });

    console.log('🎤 Transcribing audio...');
    const transcribedText = await AIService.transcribeAudio(base64Audio);

    if (!transcribedText || transcribedText.trim().length < 5) {
      console.warn('⚠️ Audio transcription returned empty or failed.');
      return res.status(400).json({
        error: 'Could not transcribe audio. Please speak clearly or type your report directly.'
      });
    }

    console.log(`✅ Transcribed: "${transcribedText.substring(0, 80)}..."`);
    // Return transcribed text so frontend auto-fills the text box
    res.json({ transcribedText });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error processing audio' });
  }
});

// PILLAR 3: Volunteer Dispatch
app.post('/dispatch', async (req, res) => {
  try {
    const { needId } = req.body;
    if (!needId) return res.status(400).json({ error: 'needId required' });

    const allNeeds = await db.getAllNeeds();
    const need = allNeeds.find(n => n.id === needId);
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const volunteers = await db.getVolunteers();

    // 1. Filter out burnout and out-of-bounds volunteers
    const eligibleVolunteers = volunteers.filter(v => {
      if (v.hoursLast30Days > 20) return false; // Burnout protection

      const dist = haversineDistance(
        need.location.lat, need.location.lng,
        v.locationCoords.lat, v.locationCoords.lng
      );
      if (dist > 5.0) return false; // 5km geo-fence
      return true;
    });

    if (eligibleVolunteers.length === 0) {
      return res.status(404).json({ error: 'No eligible volunteers found nearby' });
    }

    // 2. Score them
    const scoredVolunteers = eligibleVolunteers.map(v => {
      // inverseDistance: max 1.0 (at 0 distance), approaches 0 at 5km
      const dist = haversineDistance(need.location.lat, need.location.lng, v.locationCoords.lat, v.locationCoords.lng);
      const inverseDistance = Math.max(0, 1 - (dist / 5.0));

      // skillMatch: 1.0 if skill found, else 0.0
      const skillMatch = v.skills.includes(need.crisisType) ? 1.0 : 0.0;

      const matchScore = (v.reliabilityRate * 0.5) + (skillMatch * 0.3) + (inverseDistance * 0.2);

      return { volunteer: v, matchScore };
    });

    // Sort by score
    scoredVolunteers.sort((a, b) => b.matchScore - a.matchScore);
    if (!scoredVolunteers[0]) return res.status(404).json({ error: 'No volunteers available after scoring' });
    const topVolunteer = scoredVolunteers[0].volunteer;

    // 3. Generate Dispatch Message
    const dispatchMessage = await AIService.generateDispatchMessage(topVolunteer, need);

    res.json({
      volunteer: topVolunteer,
      dispatchMessage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PILLAR 4: AI Assistant Chat
app.post('/chat', async (req, res) => {
  try {
    const { messages, contextData } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const reply = await AIService.askAssistant(messages, contextData);
    res.json({ text: reply });
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ error: 'Internal Server Error during chat' });
  }
});

// Predictive Intelligence Logic
let cachedPredictions: any[] = [];
let lastPredictionTimestamp = 0;

async function updatePredictions() {
  try {
    const needs = await db.getAllNeeds();
    const predictions = await AIService.getPredictions(needs);
    cachedPredictions = predictions;
    lastPredictionTimestamp = Date.now();
    console.log('⚡ Predictive Intelligence updated.');
  } catch (error) {
    console.error('Failed to update predictions:', error);
  }
}

// Initial update and 90s interval
updatePredictions();
setInterval(updatePredictions, 90000);

app.get('/api/predictions', (req, res) => {
  res.json({
    predictions: cachedPredictions,
    lastUpdated: lastPredictionTimestamp
  });
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
