import { handle } from 'hono/vercel'
import { Hono } from 'hono'

// Re-implement the app logic here for Vercel
const app = new Hono()

// Import the cerebras function directly
type Message = {
    role: "user" | "assistant" | "system";
    content: string;
};

type CompletionChoice = {
    message: Message;
    finish_reason: string;
    index: number;
};

type CompletionResponse = {
    choices: CompletionChoice[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
};

async function cerebras(
    systemPrompt: string,
    userPrompt: string,
    responseFormat: string = "json_object",
    model: string = "meta-llama/llama-4-scout"
): Promise<string> {
    const apiKey = process.env.CEREBRAS_API_KEY;

    if (!apiKey) {
        throw new Error("CEREBRAS_API_KEY environment variable is required");
    }

    const messages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];

    const requestBody = {
        model,
        messages,
        max_tokens: 8192,
        temperature: 0.7,
        top_p: 0.9,
        stream: false,
        ...(responseFormat !== "text/plain" && { response_format: { type: responseFormat } })
    };

    try {
        const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Cerebras API error:", response.status, errorText);
            throw new Error(`Cerebras API request failed with status ${response.status}: ${errorText}`);
        }

        const data: CompletionResponse = await response.json();

        if (!data.choices || data.choices.length === 0) {
            throw new Error("No completion choices returned from Cerebras API");
        }

        return data.choices[0].message.content;
    } catch (error) {
        console.error("Error calling Cerebras API:", error);
        throw error;
    }
}

// Endpoint to generate HTML webpage from any route
app.get('/*', async (c) => {
    try {
        // Get the full path including query parameters
        const fullPath = c.req.path
        const queryString = c.req.url.split('?')[1] || ''
        const fullUrl = queryString ? `${fullPath}?${queryString}` : fullPath

        const systemPrompt = `You are a web developer. Based on the given url/request, generate a valid html webpage. The url/request is ${fullUrl}. Only return html, no markdown, no other text. Make sure to use css to make the website beautiful. Make sure the website is modern/sleek and uses plenty of css UI elements. be complete and do not leave out any information. do not output \`\`\`html`

        const userPrompt = `Based on this url/request generate a valid html webpage: ${fullUrl}`

        // Generate HTML using Cerebras LLM
        const htmlContent = await cerebras(systemPrompt, userPrompt, "text/plain", "meta-llama/llama-4-scout")

        // Return raw HTML
        return c.html(htmlContent)

    } catch (error) {
        console.error('Error generating webpage:', error)
        return c.json({
            error: 'Failed to generate webpage',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, 500)
    }
})

export default handle(app)