import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.OPENAI_ASSISTANT_ID;
let threadId = null;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end(); // CORS preflight
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST method is allowed" });
  }

  try {
    const userInput = req.body.message;

    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
    }

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userInput,
    });

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    let runStatus = run.status;
    while (runStatus !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const statusCheck = await openai.beta.threads.runs.retrieve(threadId, run.id);
      runStatus = statusCheck.status;
    }

    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data.find(msg => msg.role === "assistant");
const reply = lastMessage?.content?.[0]?.text?.value || "Sorry, I could not understand that.";

    res.status(200).json({ reply });
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Failed to get assistant reply." });
  }
}
