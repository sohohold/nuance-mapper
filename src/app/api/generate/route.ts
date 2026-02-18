import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { word, xAxis, yAxis } = await req.json();

    if (!word) {
      return NextResponse.json(
        { error: "Word is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        console.warn("OPENROUTER_API_KEY is not set. Returning mock data.");
        return NextResponse.json([
            { word: "MockData 1", x: 5, y: 5, nuance: "APIキー未設定時のモックデータ" },
            { word: "MockData 2", x: -5, y: -5, nuance: "環境変数を設定してください" },
            { word: word, x: 0, y: 0, nuance: "入力された単語" }
        ]);
    }

    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
      // defaultHeaders: {
      //   "HTTP-Referer": "https://nuance-mapper.vercel.app", // Adjust as necessary
      //   "X-Title": "Nuance Mapper",
      // },
    });

    const prompt = `
      # Role
      あなたは高度な日本語の語彙力を持つ「ニュアンス・マッパー」です。
      入力された単語「${word}」に対し、意味が近い類語（言い換え表現）を20個生成し、それぞれのニュアンスを以下の2軸で評価して出力してください。

      # Axes Definition (座標軸の定義)
      各単語を以下の基準で -10 から +10 の数値で採点してください。

      ## X軸: ${xAxis}
      -10: ${xAxis}が最も低い/反対の性質。
        0: 中立。
      +10: ${xAxis}が最も高い/強い性質。

      ## Y軸: ${yAxis}
      -10: ${yAxis}が最も低い/反対の性質。
        0: 中立。
      +10: ${yAxis}が最も高い/強い性質。

      # Output Format (出力形式)
      結果は必ず **JSON形式のみ** で出力してください。Markdownのコードブロックは不要です。
      JSON以外の説明文や挨拶は一切含めないでください。
      配列形式:
      [
        {
          "word": "単語",
          "x": 数値(-10〜10),
          "y": 数値(-10〜10),
          "nuance": "その言葉が持つ微細なニュアンスの短い解説（20文字以内）"
        },
        ...
      ]

      # Constraints
      1. スコアは必ず分散させてください。すべての単語が (0,0) 付近に集まらないように、極端な表現も含めて提案してください。
      2. 入力語「${word}」の品詞に合わせて適切な類語を選んでください。
    `;

    const models = [
      "z-ai/glm-4.5-air:free",
      "openai/gpt-oss-120b",
    ];

    let completion: any;
    let lastError: any;

    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`);
        completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: "system", content: "You are a helpful assistant that outputs strictly JSON." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }, 
        });
        if (completion) break;
      } catch (e) {
        console.warn(`Model ${model} failed:`, e);
        lastError = e;
      }
    }

    if (!completion) {
      throw lastError || new Error("All models failed");
    }

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("No content received from OpenRouter");
    }

    // Try to parse JSON. Sometimes models output markdown code blocks.
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const data = JSON.parse(jsonStr);

    // Ensure data is an array. Sometimes response_format: json_object makes it wrap in an object like { "result": [...] }
    if (!Array.isArray(data)) {
        if (data.results && Array.isArray(data.results)) return NextResponse.json(data.results);
        if (data.words && Array.isArray(data.words)) return NextResponse.json(data.words);
        if (data.synonyms && Array.isArray(data.synonyms)) return NextResponse.json(data.synonyms);
        // Fallback: try to find any array in values
        const arrayVal = Object.values(data).find(v => Array.isArray(v));
        if (arrayVal) return NextResponse.json(arrayVal);
    }
    
    return NextResponse.json(data);

  } catch (error: any) {
    console.error("Error generating nuances:", error);
    if (error.response) {
        console.error("OpenAI API Response Error:", error.response.data);
    }
    console.error("API Key present:", !!process.env.OPENROUTER_API_KEY);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
