export const ja = {
  // Header
  title: "Nuance Mapper",
  subtitle: "言葉の機微を、地図のように探索する。",

  // Input
  inputPlaceholder: "言葉を入力してください (例: すごい)",
  slowWarning: "10秒以上かかる場合があります",
  customizeAxis: "軸をカスタマイズ",
  closeAxisSettings: "軸設定を閉じる",
  presetLabel: "プリセットから選択",
  xAxisLabel: "X軸ラベル (横軸)",
  yAxisLabel: "Y軸ラベル (縦軸)",

  // Presets
  presetCreative: "創作",
  presetStyle: "文体",
  presetBusiness: "ビジネス",
  presetIdeas: "アイデア",
  presetHumanity: "人間性",
  presetAtmosphere: "雰囲気",

  // Preset axes
  axisMetaphor: "比喩度",
  axisSentiment: "正負の感情度",
  axisFormality: "フォーマル度",
  axisLiterary: "情緒的・文学的",
  axisLogic: "論理・客観性",
  axisEnthusiasm: "熱意・エネルギー",
  axisNovelty: "斬新さ・意外性",
  axisPracticality: "実用性・実現性",
  axisFriendliness: "親しみやすさ",
  axisIntellect: "知性・冷静さ",
  axisBrightness: "明るさ・陽気",
  axisIntensity: "激しさ・力強さ",

  // Map
  generating: "ニュアンスを生成中...",
  emptyState: "言葉を入力してマッピングを開始してください",
  mapLoading: "マップを読み込み中...",
  helpText: "Drag to pan, Scroll to zoom",

  // Footer
  copyright: "© 2026 Nuance Mapper.",

  // Errors
  errorGeneric: "エラーが発生しました。もう一度お試しください。",
  errorRateLimit: "リクエストが多すぎます。しばらくお待ちください。",
};

export type Dictionary = Record<keyof typeof ja, string>;
