import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";

export async function POST(req: Request) {
  try {
    const { word, xAxis, yAxis } = await req.json();

    if (!word) {
      return NextResponse.json({ error: "Word is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn("OPENROUTER_API_KEY is not set. Returning mock data.");
      return NextResponse.json([
        {
          word: "MockData 1",
          x: 5,
          y: 5,
          nuance: "APIキー未設定時のモックデータ",
        },
        {
          word: "MockData 2",
          x: -5,
          y: -5,
          nuance: "環境変数を設定してください",
        },
        { word: word, x: 0, y: 0, nuance: "入力された単語" },
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

    const AXIS_MAX_VAL = 10;

    const prompt = `
      # Role
      あなたは高度な日本語の語彙力を持つ「ニュアンス・マッパー」です。

      # Task
      入力語「${word}」の類語・言い換え表現を、2次元の座標空間上に**なるべく広く分散させて**配置してください。
      **重要: まず座標空間の各領域を意識し、その領域にふさわしい表現を探す、という順序で考えてください。**

      # Axes Definition (座標軸の定義)
      ## X軸: ${xAxis}
      -${AXIS_MAX_VAL}: ${xAxis}が最も低い/反対の性質 ← 0: 中立 → +${AXIS_MAX_VAL}: ${xAxis}が最も高い/強い性質

      ## Y軸: ${yAxis}
      -${AXIS_MAX_VAL}: ${yAxis}が最も低い/反対の性質 ← 0: 中立 → +${AXIS_MAX_VAL}: ${yAxis}が最も高い/強い性質

      # Zone-Based Generation Strategy（ゾーン分散戦略）
      座標平面を以下の9ゾーンに分け、**各ゾーンに最低1つ、合計20個**の単語を配置してください。
      ゾーン名は出力に含めないでください。

      1. 右上 (x>0, y>0): ${xAxis}が高く、${yAxis}も高い表現
      2. 右下 (x>0, y<0): ${xAxis}が高いが、${yAxis}は低い表現
      3. 左上 (x<0, y>0): ${xAxis}が低いが、${yAxis}は高い表現
      4. 左下 (x<0, y<0): ${xAxis}も${yAxis}も低い表現
      5. 右端 (x≈+${AXIS_MAX_VAL}): ${xAxis}が極端に高い表現
      6. 左端 (x≈-${AXIS_MAX_VAL}): ${xAxis}が極端に低い表現
      7. 上端 (y≈+${AXIS_MAX_VAL}): ${yAxis}が極端に高い表現
      8. 下端 (y≈-${AXIS_MAX_VAL}): ${yAxis}が極端に低い表現
      9. 中央 (x≈0, y≈0): 中立的な表現

      # Output Format (出力形式)
      結果は必ず **JSON配列のみ** で出力してください。Markdownのコードブロックは不要です。
      JSON以外の説明文や挨拶は一切含めないでください。
      [
        {
          "word": "単語",
          "x": 数値(-${AXIS_MAX_VAL}〜${AXIS_MAX_VAL}),
          "y": 数値(-${AXIS_MAX_VAL}〜${AXIS_MAX_VAL}),
          "nuance": "その言葉が持つ微細なニュアンスの短い解説（20文字以内）"
        },
        ...
      ]

      # Constraints
      1. **座標空間全体をカバーすること。** 4象限すべてに単語が存在し、|x|≥7 や |y|≥7 の端にも配置すること。
      2. 入力語「${word}」と意味的に関連がある語を選ぶこと。ただし、軸の端をカバーするためにやや広い関連語も許容する。
      3. 入力語「${word}」の品詞に合わせて適切な類語を選ぶこと。
      4. 同じような座標に複数の単語が集中しないこと。
    `;

    const models = [
      "openai/gpt-oss-120b:free",
      "stepfun/step-3.5-flash:free",
      "arcee-ai/trinity-large-preview:free",
      "z-ai/glm-4.5-air:free",
      "deepseek/deepseek-r1-0528:free",
      "openrouter/free",
    ];

    let completion: ChatCompletion | null = null;
    let lastError: unknown;

    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`);
        completion = await openai.chat.completions.create({
          model: model,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that outputs strictly JSON.",
            },
            { role: "user", content: prompt },
          ],
          // response_format: { type: "json_object" }, // Many free/reasoning models don't support this
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
      if (data.results && Array.isArray(data.results))
        return NextResponse.json(data.results);
      if (data.words && Array.isArray(data.words))
        return NextResponse.json(data.words);
      if (data.synonyms && Array.isArray(data.synonyms))
        return NextResponse.json(data.synonyms);
      // Fallback: try to find any array in values
      const arrayVal = Object.values(data).find((v) => Array.isArray(v));
      if (arrayVal) return NextResponse.json(arrayVal);
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Error generating nuances:", error);
    if (error instanceof Error && "response" in error) {
      console.error(
        "OpenAI API Response Error:",
        (error as Error & { response: { data: unknown } }).response.data,
      );
    }
    console.error("API Key present:", !!process.env.OPENROUTER_API_KEY);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal Server Error", details: message },
      { status: 500 },
    );
  }
}
