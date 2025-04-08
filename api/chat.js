import OpenAI from "openai";

// Validate environment variables
const apiKey = process.env.OPENAI_API_KEY;
const assistantId = process.env.OPENAI_ASSISTANT_ID;

if (!apiKey) {
  console.error("❌ OPENAI_API_KEY is missing in environment variables.");
}

if (!assistantId) {
  console.error("❌ OPENAI_ASSISTANT_ID is missing in environment variables.");
}

const openai = apiKey ? new OpenAI({ apiKey }) : null;

// Serverless API handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Reject unsupported methods
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST method is allowed." });
  }

  // Fail early if OpenAI is not set up
  if (!openai || !assistantId) {
    return res.status(500).json({ error: "OpenAI configuration missing on server." });
  }

  try {
    const userInput = req.body.message;
    console.log(`📩 Received user message: "${userInput}"`);

    // Create a new thread (temporary — per request)
    const thread = await openai.beta.threads.create();
    const threadId = thread.id;
    console.log(`🧵 Created thread ID: ${threadId}`);

    // Send user message to the thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userInput,
    });

    // Run the assistant on the thread
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    console.log(`⚙️ Assistant run created. Polling for completion...`);

    // Polling loop for assistant response
    let runStatus = run.status;
    while (runStatus !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const statusCheck = await openai.beta.threads.runs.retrieve(threadId, run.id);
      runStatus = statusCheck.status;
      console.log(`⏳ Run status: ${runStatus}`);
    }

    // Fetch assistant response messages (latest first)
    const messages = await openai.beta.threads.messages.list(threadId, { order: "desc" });
    const lastAssistantMessage = messages.data.find(msg => msg.role === "assistant");
    const reply = lastAssistantMessage?.content?.[0]?.text?.value || "Sorry, I could not understand that.";

    console.log(`✅ Assistant reply: "${reply}"`);

    res.status(200).json({ reply });
  } catch (err) {
    console.error("❌ API Error:", err);
    res.status(500).json({ error: "Failed to process your request." });
  }
}
