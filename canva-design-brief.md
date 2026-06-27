# Canva Design Brief

## Product Direction

AI搭載型SNS運用自動化ツール / AIマーケティングオートメーションツール。
Threadsを起点に、投稿生成、反応検知、見込み客化、保存数分析、フォロワー増加分析、自動フォローまでを管理する。

## Original Brand Candidates

1. LeadArc AI
   - SNS反応を見込み客導線へつなぐ印象
2. SyncPost MA
   - 投稿とMAの同期を表現
3. ThreadFlow AI
   - Threads起点の運用フローを表現

推奨は `LeadArc AI`。tthpro風の暗いSaaS感は参考にしつつ、背景やベース面は添付写真のようなティールからブルーへのグラデーションにする。カード内やパネル内は濃紺でよい。

## Visual Identity

- Base: teal to cyan to blue to indigo gradient, similar to the attached reference image
- Panel / Card: dark navy, e.g. `#071426`, `#0B1B2E`, `#0E2236`
- Line: muted cool gray
- Primary: teal to blue gradient
- Secondary: blue / cyan
- Accent: one warm color only
- Success: green or blue-green

背景色は参照元と被らない方針。単純な黒紫ではなく、添付写真のような `#13D6B2 -> #14B9C5 -> #2477D4 -> #3E43DC` のグラデーションをベースにする。カード、入力欄、分析パネル、サイドバー内は濃紺で統一してよい。

## Canva Assets To Create

1. Logo
   - Square app icon and horizontal lockup
   - Motif: arc, signal line, automation node, AI spark
   - Avoid: direct Threads logo clone, tthpro robot clone

2. Mobile Dashboard Mock Header
   - Size: 1170 x 2532 for iPhone preview
   - Original background color, strong card hierarchy, large Japanese labels
   - First view: dashboard, KPI 2x2, follower growth donut chart, quick action buttons

3. Empty State Illustration
   - Size: 800 x 600 transparent PNG
   - Motif: document card + signal nodes + small AI spark
   - Use inside 投稿一覧 / 最近の投稿 empty panel

4. OGP / Hero Visual
   - Size: 1200 x 630
   - Text: `AI SNS Marketing Automation`
   - Subtext: `投稿から見込み客化、自動フォローまで管理`

5. Feature Icons
   - AI投稿生成
   - 投稿比較
   - 見込み度スコア
   - 自動フォロー設定
   - 反応から申込まで
   - バズリサーチ
   - バズ投稿分析
   - 予約配信
   - 保存数分析
   - フォロワー増加分析

## Canva Prompt Drafts

Logo prompt:

```text
Create a premium SaaS logo for "LeadArc AI", an AI social media marketing automation tool. Use an abstract arc and connected signal nodes, with an original color palette that does not resemble tthpro. Minimal, modern, high contrast, app-icon friendly, not similar to Threads or any existing logo.
```

OGP prompt:

```text
Design a 1200x630 hero image for "LeadArc AI", an AI-powered SNS marketing automation platform. Premium SaaS dashboard style with an original background color. Show an automation flow from social post to saved post count, follower growth, prospect score, and automated follow-up. Japanese-ready layout with strong empty space for headline.
```

Empty state prompt:

```text
Create a transparent PNG illustration for a dark SaaS app empty state. Show a document card connected to small automation nodes and an AI spark, using violet, teal, and muted blue. Minimal, not cartoonish, suitable for a mobile dashboard.
```

## Integration Plan

1. Export logo as transparent PNG or SVG from Canva.
2. Export OGP as JPG/PNG.
3. Export empty state and icons as transparent PNG.
4. Place assets under `threads-ui-tool/assets/`.
5. Update `index.html` to replace text-only brand marks and generic cards with Canva assets.
