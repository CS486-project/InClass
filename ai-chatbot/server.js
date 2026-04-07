const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

require('dotenv').config();

const { OpenAI } = require('openai');
const mongoose = require('mongoose');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const retrievalService = require('./services/retrievalService');

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB connected')
        await retrievalService.initialize();

        app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        });
  })
    .catch((err) => console.error('MongoDB connection error:', err));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

const Interaction = require('./models/Interaction'); // Import Interaction model

app.post('/chat', async (req, res) => {
    const {participantId, message, retrievalMethod} = req.body;

    if (!message) {
        return res.status(400).send('Message is required');
    }

    try {
        const topK = await retrievalService.retrieve(message, {
          method: retrievalMethod,
          topK: 3
        });
    
        const context = topK
          .map((c, i) => `[${i + 1}] ${c.documentName}\n${c.chunkText}`)
          .join("\n\n");
    
        const prompt = `Use ONLY the context below. If the answer is not in the 
        context, say you don't have enough evidence.
        
        CONTEXT:
        ${context}
    
        QUESTION:
        ${message}`;
    
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }]
        });
        
        const botResponse = completion.choices[0].message.content.trim();
        
        const retrievedDocuments = topK;
        
        const confidenceCalculator = require("./services/confidenceCalculator");
        
        const confidenceMetrics = confidenceCalculator.calculate({
          retrievedDocs: topK,
          retrievalMethod
        });

        // Log the interaction to MongoDB
        const interaction = new Interaction({
            participantId: participantId,
            userInput: message,
            botResponse: botResponse,
            retrievalMethod: retrievalMethod,
            retrievedDocuments: retrievedDocuments.map((d) => ({
            docName: d.documentName,
            chunkIndex: d.chunkIndex,
            chunkText: d.chunkText,
            relevanceScore: d.relevanceScore ?? d.score
            })),
            confidenceMetrics: confidenceMetrics
        });
    
        await interaction.save(); // Save the interaction to MongoDB
    
        res.json({ botResponse, retrievedDocuments, confidenceMetrics });
    
    } catch (error) {
        console.error('Error interacting with OpenAI API:', error.message);
        res.status(500).send('Internal Server Error');
    }
});

const EventLog = require('./models/EventLog'); // Import EventLog model

app.post('/log-event', async (req, res) => {
    const { participantId, eventType, elementName, timestamp } = req.body;

    try {
        // Log the event to MongoDB
        const event = new EventLog({ participantId, eventType, elementName, timestamp}); 
        await event.save();
        res.status(200).send('Event logged successfully');
        
    } catch (error) {
        console.error('Error logging event:', error.message);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/history', async (req, res) => {
    const { participantId } = req.body;
    
    try {
        const interactions = await Interaction.find({ participantId }).sort({ timestamp: 1 });
        res.json(interactions); // sends back array of { userInput, botResponse, timestamp }
    } catch (error) {
        console.error('Error fetching history:', error.message);
        res.status(500).send('Internal Server Error');
    }
});

const multer = require("multer");
const Document = require("./models/Document"); // Import Document model
const documentProcessor = require("./services/documentProcessor");
const embeddingService = require("./services/embeddingService");
// Save uploaded files so documentProcessor.js can read them
const upload = multer({ dest: "uploads/" });

app.post("/upload-document", upload.single("document") , async (req, res) => {
  if (!req.file ) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const processed = await documentProcessor.processDocument(req.file);

  const chunkObjects = processed.chunks.map((text, index) => ({
    chunkIndex: index,
    text
  }));

  const chunksWithEmbeddings = await embeddingService.generateEmbeddings(chunkObjects);
  
  await Document.create({
    filename: req.file.originalname,
    text: processed.fullText,
    chunks: chunksWithEmbeddings,
    processingStatus: "completed"
  });

    await retrievalService.rebuildIndex();

  res.json({
    status: "ok",
    filename: req.file.originalname,
    chunkCount: processed.chunks.length
  });
});

app.get("/documents", async (req, res) => {
  const docs = await Document.find({})
  .select("_id filename processingStatus processedAt")
  .sort({ processedAt: -1 });
  res.json(docs);
});

// const PORT = process.env.PORT || 30003w5





