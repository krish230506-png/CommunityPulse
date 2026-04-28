# ⚡ CommunityPulse: CommunityPulse Command Center

[![AI Powered](https://img.shields.io/badge/AI-Gemini_2.0_Flash-blue?style=for-the-badge)](https://ai.google.dev/)
[![Tech Stack](https://img.shields.io/badge/Stack-React_%7C_Node_%7C_Leaflet-green?style=for-the-badge)]()

**CommunityPulse** is a high-fidelity crisis coordination and emergency response platform. Designed as a "Command Center" for disaster zones, it bridges the gap between citizens in distress and volunteer response teams using state-of-the-art AI.

---

## 🚀 Key Features

### 🎙️ Multimodal Emergency Ingestion
- **Interactive AI Call**: Citizens can speak naturally to an AI assistant that understands context and location in multiple languages (English, Hindi, Marathi, Tamil, Bengali, Telugu).
- **Visual Evidence**: Upload photos of incidents directly from the field for instant AI analysis and verification.
- **GPS-Aware**: Automatic location extraction ensures help is sent exactly where it's needed.

### 🧠 Predictive Intelligence Dashboard
- **Dynamic Heatmaps**: Visualizes crisis density in real-time using GPU-accelerated Leaflet overlays.
- **Criticality Scoring**: AI automatically ranks incidents from 0-100 based on scale, urgency, and report velocity.
- **Smart Deduplication**: Semantic analysis groups multiple reports of the same incident into a single "Crisis Cluster" to prevent resource waste.

### 🚁 Autonomous Dispatch System
- **Intelligent Matching**: The system analyzes volunteer skills, distance (5km geofence), and reliability to find the perfect responder.
- **WhatsApp-Ready**: Generates personalized, localized dispatch messages ready for instant transmission.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, Leaflet.js (Map), Framer Motion (Animations).
- **Backend**: Node.js, Express, Multer (Media handling).
- **AI Engine**: Google Gemini 2.0 Flash (Extraction, Transcription, & Predictions), Google Generative AI Embeddings.
- **Data Layer**: Firestore (Cloud) or Mock In-Memory (Local Demo Mode).

---

## 📦 Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
# Create a .env file with:
# GEMINI_API_KEY=your_key_here
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:5173` to access the Admin Command Center, or `http://localhost:5173/report` for the Citizen Portal.

---

## 🌐 Technical Architecture

| Pillar | Description |
| :--- | :--- |
| **Ingestion** | Web Speech API for real-time transcription + Gemini for semantic extraction. |
| **Analysis** | Cosine similarity on AI embeddings for sub-2km deduplication. |
| **Dispatch** | Haversine distance calculations paired with Skill-Match scoring. |
| **Intelligence** | 90-second automated refresh of predictive crisis escalation risks. |

---

## 🛡️ Demo Notes
- **Local Mode**: If no `serviceAccount.json` is provided, the system defaults to a high-fidelity local mock mode with 1,150+ pre-seeded volunteers and 8 initial crisis scenarios.
- **Pure Mode**: Supports Pure Black/Pure White high-contrast themes for outdoor/nighttime visibility.

---


