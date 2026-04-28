# ⚡ CommunityPulse
### *When every second counts, intelligence scales.*

**AI-powered crisis coordination that bridges citizens in distress and volunteer responders — in real time.**


> 🏆 *Built for Google Solution Challenge 2026 India 

> 🌐 **Live Demo**: [community-pulse-t6p0.onrender.com](https://community-pulse-t6p0.onrender.com)

---

## 🌍 The Problem

During a disaster, **coordination kills more time than the disaster itself.** Citizens can't reach responders. Duplicate reports overwhelm operators. Volunteers show up at the wrong place. The right skills never meet the right crisis.

**CommunityPulse fixes this.**

---

## 🚀 Key Features

### 🎙️ Multimodal Emergency Ingestion
Citizens report crises the way humans communicate — by talking. The AI handles the rest.

- **Voice-first reporting** via Web Speech API with real-time transcription
- **Natural language understanding** powered by Gemini 2.0 Flash — no forms, no friction
- **6 languages supported**: English, Hindi, Marathi, Tamil, Bengali, Telugu
- **Photo evidence upload** with instant AI analysis and scene verification
- **Automatic GPS extraction** — location is inferred and validated, not manually entered

### 🧠 Predictive Intelligence Dashboard
The Command Center doesn't just display data — it thinks ahead.

- **Live crisis heatmaps** rendered via canvas-accelerated Leaflet overlays
- **AI Criticality Scoring (0–100)** weighing scale, urgency, and report velocity in real time
- **Semantic deduplication** — cosine similarity on AI embeddings clusters overlapping reports into unified "Crisis Clusters", eliminating noise and redundant dispatch
- **90-second auto-refresh** triggers escalation risk predictions before situations deteriorate

### 🚁 Autonomous Dispatch System
The right volunteer, at the right place, at the right time.

- **Intelligent matching** scores volunteers on skills, availability, and proximity (5km geofence)
- **Haversine distance calculations** ensure accurate real-world routing, not straight-line guesses
- **Reliability scoring** deprioritizes no-shows from past responses automatically
- **WhatsApp-ready dispatch messages** generated in the volunteer's language, ready to send

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, TailwindCSS | Fast, type-safe UI with utility-first styling |
| **Animations** | Framer Motion | Smooth transitions for high-stress UX |
| **Maps** | Leaflet.js + Canvas overlays | Lightweight, performant heatmap rendering |
| **Backend** | Node.js, Express, Multer | Handles concurrent media uploads reliably |
| **AI Engine** | Google Gemini 2.0 Flash | Multimodal — text, audio, image in one model |
| **Embeddings** | Google Generative AI | Semantic similarity for deduplication |
| **Database** | Firestore (prod) / In-memory (demo) | Zero-config local demo mode |

---

## 📦 Quick Start

### Prerequisites
- Node.js **v18+**
- A free [Google Gemini API key](https://aistudio.google.com/app/apikey)
- *(Optional)* Firebase `serviceAccount.json` for cloud persistence

> **No credentials? No problem.** Skip the API key and the system auto-boots in **Demo Mode** with 1,150+ pre-seeded volunteers and 8 live crisis scenarios.

### 1. Backend

```bash
cd backend
npm install

# Create your environment file
echo "GEMINI_API_KEY=your_key_here" > .env

npm run dev
# → API running at http://localhost:3000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# → App running at http://localhost:5173
```

### 3. Navigate

- **Admin Command Center** → `http://localhost:5173`
- **Citizen Reporting Portal** → `http://localhost:5173/report`

---

## 🌐 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CITIZEN                              │
│         Voice / Photo / Text  →  GPS Location               │
└──────────────────────┬──────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  INGESTION LAYER │
              │  Web Speech API  │
              │  Gemini 2.0 Flash│  ← Multimodal extraction
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │  ANALYSIS LAYER  │
              │  AI Embeddings   │  ← Cosine similarity dedup
              │  Criticality AI  │  ← 0-100 urgency scoring
              │  Heatmap Engine  │  ← Canvas-rendered clusters
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │  DISPATCH LAYER  │
              │  Haversine Geo   │  ← 5km geofence matching
              │  Skill Matcher   │  ← Volunteer scoring
              │  Message Gen     │  ← Localized WhatsApp alerts
              └────────┬─────────┘
                       │
                  VOLUNTEER 🚁
```

---

## 🎨 Accessibility & Visibility

CommunityPulse is built for the field, not just the office.

- **Pure Black** high-contrast theme for direct sunlight readability
- **Pure White** theme for nighttime/low-light operations
- Voice-first design removes literacy and typing barriers for citizens in distress

---

## 🛡️ Demo Mode

No credentials needed to explore the full system. Run without `serviceAccount.json` and the app loads a high-fidelity mock environment:

- ✅ **1,150+ pre-seeded volunteers** with varied skills and locations
- ✅ **8 active crisis scenarios** across different severity levels
- ✅ All AI features active (requires `GEMINI_API_KEY`)
- ✅ Full dispatch simulation with match scoring

---

## 🗺️ Roadmap

- [ ] SMS fallback ingestion for low-connectivity zones
- [ ] Offline-capable PWA for field volunteers
- [ ] Multi-agency coordination view (Police, Fire, Medical)
- [ ] Automated post-incident analytics and response time reporting

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT © 2025 CommunityPulse Contributors

---

**Built with urgency. Deployed with care.**

*If this project resonates with you, give it a ⭐ — it helps more builders find it.*
