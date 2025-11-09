# Othello Showdown

Vite + React + TypeScript で構築したシンプルなスタンドアロン版オセロです。ブラウザさえあれば遊べるようにDiscord連携や外部SDKへの依存を取り除いています。

## 主な特徴
- 置けるマスのハイライト、手番スキップ、勝敗判定まで備えたフルルール実装
- 手数・残りマス・優勢サイドを即座に把握できるマッチインサイトカードを搭載
- WebSocket サーバーを同梱し、ランダムマッチ／キー共有／観戦付きのオンライン対戦をサポート
- Vite によるホットリロード開発／静的ファイル出力に対応

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` (Viteの表示するURL) を開くと動作を確認できます。1台の端末を交互に使ってローカル対戦することを想定しています。

## スクリプト
- `npm run dev` — フロントエンド開発サーバー (ホットリロード)
- `npm run lint` — ESLint 実行
- `npm run build` — TypeScript ビルド + Vite の本番バンドル生成 (オンラインサーバーコードも型チェック)
- `npm run preview` — ビルド済み成果物のローカル配信
- `npm run server` — `ws://localhost:8787` でオンラインマッチングサーバーを起動 (tsx 実行)
- `npm run server:build` — サーバーコードを `server-dist/` にトランスパイル
- `npm run server:start` — ビルド済みサーバーの常駐起動（`--experimental-specifier-resolution=node` 付きで ES Modules の拡張子を補完）
- `npm run integrated` — `build` でクライアント/サーバー双方を本番ビルドし、`server:start` と `npm start` (4173番ポートでの Vite preview) を同時起動

## オンライン対戦の起動手順
1. 依存関係をインストールし、`npm run server` で WebSocket サーバーを立ち上げます。デフォルトではポート `8787` で待ち受けます。
2. もう一つのターミナルで `npm run dev` を走らせ、ブラウザから「オンライン」モードに切り替えます。
3. ランダムマッチを押すとキューに入り、2 クライアント揃い次第、自動でマッチングキーが割り当てられます。キーを入力して参加/観戦することも可能です。満員の部屋へ入ろうとすると観戦モードへ切り替える確認ダイアログが表示されます。

### サーバー URL の切り替え
- `.env.local` などで `VITE_MATCH_SERVER_URL="ws://host:port"` を指定するか、アプリ内オンラインパネル最下部の「マッチングサーバー URL」で変更できます。
- UI から更新するとブラウザの `localStorage` に保存され、再読み込みや他タブでも維持されます。`既定値` ボタンで `ws://localhost:8787` に戻せます。

> 接続先を変更したい場合は `VITE_MATCH_SERVER_URL` 環境変数で `ws://host:port` を上書きしてください。

## ディレクトリ案内
- `shared/othello.ts` — クライアント/サーバー双方で共有するオセロロジック
- `src/lib/othello.ts` — 上記 shared ロジックの再エクスポート (UI から参照)
- `src/hooks/useOnlineMatch.ts` — WebSocket と状態管理を司る React フック
- `src/App.tsx` — UI とゲーム進行、オンラインコントロールパネル
- `src/App.css` — 盤面・スコアカード・インサイトカードおよびオンライン UI のスタイル
- `server/index.ts` — WebSocket ベースのマッチング / オンライン対局サーバー

## ビルドと配置

```bash
npm run build
```

`dist/` に静的ファイルが生成されるので、任意の静的ホスティングにアップロードしてください。
