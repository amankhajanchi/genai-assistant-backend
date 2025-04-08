import OpenAI from "openai";

// Validate environment variables at startup
const apiKey = process.env.OPENAI_API_KEY;
const assistantId = process.env.OPENAI_ASSISTANT_ID;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing in environment variables");
}
if (!assistantId) {
  throw new Error("OPENAI_ASSISTANT_ID is missing in environment variables");
}

const openai = new OpenAI({ apiKey });

// Configuration constants
const POLLING_INTERVAL = 1000; // 1 second
const MAX_POLLING_ATTEMPTS = 30; // 30 seconds timeout

/**
 * Serverless API handler for OpenAI assistant interaction
 */
export default async function handler(req, res) {
  // CORS setup
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed",
      allowed: "POST"
    });
  }

  const { message, detected_role } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "Bad Request",
      message: "A valid 'message' string is required in the request body"
    });
  }

  try {
    const userInput = message.trim();
    console.log(`📩 Received message: "${userInput}"`);
    console.log(`🧠 Detected role: ${detected_role || 'none'}`);

    // Build contextual prefix if role is detected
    let roleContext = "";
    if (detected_role) {
      roleContext = `USER'S PROFESSIONAL ROLE: ${detected_role.toUpperCase()}.
Tailor your response with 2-3 specific AI applications for this field.
Suggest relevant training programs.`;
    }

    // Create thread
    const thread = await openai.beta.threads.create();
    console.log(`🧵 Thread ID: ${thread.id}`);

    // Send message with context
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: `${roleContext}\n\nUser query: ${userInput}`
    });

    // Start assistant run
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId
    });

    console.log(`⚙️ Assistant run created: ${run.id}`);

    // Poll for completion
    let attempts = 0;
    let runStatus = run.status;

    while (runStatus !== "completed" && attempts < MAX_POLLING_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
      const statusCheck = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      runStatus = statusCheck.status;
      console.log(`⏳ Run status: ${runStatus}`);
      if (runStatus === "failed" || runStatus === "cancelled") {
        throw new Error(`Run ${runStatus}`);
      }
      attempts++;
    }

    if (attempts >= MAX_POLLING_ATTEMPTS) {
      throw new Error("Timeout waiting for assistant response");
    }

    // Get response
    const messages = await openai.beta.threads.messages.list(thread.id, {
      order: "desc",
      limit: 1
    });

    const assistantMessage = messages.data[0];
    const reply = assistantMessage?.role === "assistant" && assistantMessage.content[0]?.text?.value
      ? assistantMessage.content[0].text.value
      : "Sorry, I could not generate a response.";

    console.log(`✅ Assistant reply: "${reply}"`);
    return res.status(200).json({ reply });

  } catch (error) {
    console.error("❌ API Error:", error.message);
    const status = error.status || 500;
    return res.status(status).json({
      error: "Internal Server Error",
      message: error.message
    });
  }
}
