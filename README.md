# Othello Showdown

Vite + React + TypeScript で構築したシンプルなスタンドアロン版オセロです。ブラウザさえあれば遊べるようにDiscord連携や外部SDKへの依存を取り除いています。

## 主な特徴
- 置けるマスのハイライト、手番スキップ、勝敗判定まで備えたフルルール実装
- ローカル／オンライン対局の進行状況をブラウザに保存し、再読み込み後もそのまま再開
- ローカル対戦は CPU と対局でき、やさしい〜さいきょうの 4 段階 + 先手/後手を UI から即切り替え
- WebSocket サーバーを同梱し、ランダムマッチ／キー共有／観戦付きのオンライン対戦をサポート
- Vite によるホットリロード開発／静的ファイル出力に対応

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` (Viteの表示するURL) を開くと動作を確認できます。1台の端末を交互に使ってローカル対戦することを想定しています。

## ローカルCPU対戦
- ヘッダー下の「CPU対戦設定」で難易度（やさしい／ふつう／つよい／さいきょう）と先手番（黒/白）を選択できます。
- 選択内容は `localStorage` に保持され、次回アクセス時も前回の設定で開始します。
- 人間の手番では置けるマスが強調表示され、CPU手番は「CPUが思考中…」と表示されます。さいきょうは探索深さ6のネガマックス＋ヒューリスティクスで、つよいより慎重に角・安定石を重視します。

## スクリプト
- `npm run dev` — フロントエンド開発サーバー (ホットリロード)
- `npm run lint` — ESLint 実行
- `npm run build` — TypeScript ビルド + Vite の本番バンドル生成 (オンラインサーバーコードも型チェック)
- `npm run preview` — ビルド済み成果物のローカル配信
- `npm run server` — `ws://localhost:8787` でオンラインマッチングサーバーを起動 (tsx 実行)
- `npm run server:build` — サーバーコードを `server-dist/` にトランスパイル
- `npm run server:start` — ビルド済みサーバーの常駐起動（`--experimental-specifier-resolution=node` 付きで ES Modules の拡張子を補完）
- `npm run integrated` — `build` でクライアント/サーバー双方を本番ビルドし、`server:start` と `npm start` (4173番ポートでの Vite preview) を同時起動
- `npx esbuild scripts/cpuBench.ts --bundle --platform=node --format=esm --outfile=.cpu-bench.mjs && CPU_BENCH_GAMES=4 CPU_BENCH_RANDOM_PLIES=0 node .cpu-bench.mjs` — CPU 難易度同士を自動対局させるベンチマーク。`CPU_BENCH_GAMES` で局数、`CPU_BENCH_RANDOM_PLIES` で序盤のランダム手数を指定できます（結果ログ後 `.cpu-bench.mjs` は不要なら削除してください）。

## オンライン対戦の起動手順
1. 依存関係をインストールし、`npm run server` で WebSocket サーバーを立ち上げます。デフォルトではポート `8787` で待ち受けます。
2. もう一つのターミナルで `npm run dev` を走らせ、ブラウザから「オンライン」モードに切り替えます。
3. ランダムマッチを押すとキューに入り、2 クライアント揃い次第、自動でマッチングキーが割り当てられます。キーを入力して参加/観戦することも可能です。満員の部屋へ入ろうとすると観戦モードへ切り替える確認ダイアログが表示されます。

### セッション継続について
- ローカル対局は `localStorage` に盤面・手番・ステータスメッセージを自動保存し、ページを再読み込みしても直前の局面から再開できます。
- オンライン対局中にブラウザをリロードしても、WebSocket クライアント ID を使って同じ部屋に再アタッチします。サーバー側は既定で 15 秒 (`MATCH_DISCONNECT_GRACE_MS` で変更可) までは対局を維持するため、短時間の回線断やリロードでは対局が終了しません。
- 対局中に 3 分 (`MATCH_TURN_TIMEOUT_MS` で変更可) 以上着手がない場合、手番プレイヤーがタイムアウト負けとなり、相手の勝利として処理されます。現在のターン欄に残り時間が表示されます。

### サーバー URL の切り替え
- `.env.local` などで `VITE_MATCH_SERVER_URL="ws://host:port"` を指定するか、アプリ内オンラインパネル最下部の「マッチングサーバー URL」で変更できます。
- UI から更新するとブラウザの `localStorage` に保存され、再読み込みや他タブでも維持されます。`既定値` ボタンで `ws://localhost:8787` に戻せます。

> 接続先を変更したい場合は `VITE_MATCH_SERVER_URL` 環境変数で `ws://host:port` を上書きしてください。

## ディレクトリ案内
- `shared/othello.ts` — クライアント/サーバー双方で共有するオセロロジック
- `src/lib/othello.ts` — 上記 shared ロジックの再エクスポート (UI から参照)
- `src/hooks/useOnlineMatch.ts` — WebSocket と状態管理を司る React フック
- `src/App.tsx` — UI とゲーム進行、オンラインコントロールパネル
- `src/App.css` — 盤面・スコアカード・オンライン UI 全体のスタイル
- `server/index.ts` — WebSocket ベースのマッチング / オンライン対局サーバー

## ビルドと配置

```bash
npm run build
```

`dist/` に静的ファイルが生成されるので、任意の静的ホスティングにアップロードしてください。
