# SNS MNM-PRO 譛ｬ逡ｪ蜑阪ヰ繝・け繧ｨ繝ｳ繝牙渕逶､險ｭ險・
菴懈・譌･: 2026-06-21

## 逶ｮ逧・
Threads API譛ｬ謗･邯壹√Λ繧､繧ｻ繝ｳ繧ｹ邂｡逅・∫ｮ｡逅・判髱｢菫晁ｭｷ縲＾penAI API繧ｭ繝ｼ邂｡逅・ｒ螳牙・縺ｫ陦後≧縺溘ａ縲，loudflare Pages / Workers / D1 / KV / Secrets 縺ｮ讒区・繧貞崋繧√ｋ縲・
迴ｾ譎らせ縺ｧ縺ｯ繝輔Ο繝ｳ繝・I縺ｨDry Run Functions繧貞｣翫＆縺壹∵悽逡ｪ謗･邯壹↓騾ｲ繧√ｋ縺溘ａ縺ｮ險ｭ險医・繝槭う繧ｰ繝ｬ繝ｼ繧ｷ繝ｧ繝ｳ繝ｻ蜈ｱ騾壹・繝ｫ繝代・繧貞・縺ｫ逕ｨ諢上☆繧九・
## 迴ｾ蝨ｨ縺ｮCloudflare謗･邯夂憾諷・
- Pages project: `sns-mnm-pro-prototype`
- D1 binding: `DB`
- D1 database: `sns-mnm-pro-prod`
- KV binding: `SESSION_KV`
- KV namespace: `SESSION_KV`
- Secrets: `APP_SECRET`, `ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`, `OPENAI_ENCRYPTION_KEY`, `THREADS_ENCRYPTION_KEY`
- D1 migration: `0001_initial_schema.sql` 驕ｩ逕ｨ貂医∩

`STRIPE_SECRET_KEY` 縺ｯ蠕檎ｶ夂畑縺ｮ繝励Ξ繝ｼ繧ｹ繝帙Ν繝繝ｼ縺ｨ縺励※逋ｻ骭ｲ貂医∩縲４tripe螳滄｣謳ｺ蜑阪↓譛ｬ迚ｩ縺ｸ蟾ｮ縺玲崛縺医ｋ縲・
## 謗ｨ螂ｨCloudflare讒区・

- Cloudflare Pages: 髱咏噪UI縺ｨPages Functions縺ｮ驟堺ｿ｡
- Pages Functions / Workers: 隱崎ｨｼ縲√Λ繧､繧ｻ繝ｳ繧ｹ辣ｧ蜷医∫ｮ｡逅・PI縲ゝhreads API荳ｭ邯吶＾penAI API荳ｭ邯・- D1: 繝ｦ繝ｼ繧ｶ繝ｼ縲√Λ繧､繧ｻ繝ｳ繧ｹ縲∫筏縺苓ｾｼ縺ｿ縲∝｣ｲ荳翫、I險ｭ螳壹ゝhreads謗･邯壹∫函謌仙ｱ･豁ｴ縲∵兜遞ｿ莠亥ｮ壹∫屮譟ｻ繝ｭ繧ｰ
- KV: 遏ｭ譛溘そ繝・す繝ｧ繝ｳ繧ｭ繝｣繝・す繝･縲，SRF繝医・繧ｯ繝ｳ縲∫洒譛溘Ρ繝ｳ繧ｿ繧､繝繝医・繧ｯ繝ｳ
- Secrets: 證怜捷蛹悶く繝ｼ縲√ワ繝・す繝･pepper縲ヾtripe遘伜ｯ・く繝ｼ縲仝ebhook secret
- Cron Triggers: Threads莠育ｴ・兜遞ｿ縺ｮ螳溯｡・- Stripe Payment Links: 蛻晄悄豎ｺ貂・- Stripe Webhook: 蠕檎ｶ壹・閾ｪ蜍輔Λ繧､繧ｻ繝ｳ繧ｹ逋ｺ陦・
## D1繝槭う繧ｰ繝ｬ繝ｼ繧ｷ繝ｧ繝ｳ

蛻晄悄繧ｹ繧ｭ繝ｼ繝槭・ `migrations/0001_initial_schema.sql` 縺ｫ菴懈・貂医∩縲・
驕ｩ逕ｨ蜑阪↓譛ｬ逡ｪD1繧剃ｽ懈・縺励￣ages/Workers縺ｫ `DB` binding 繧定ｨｭ螳壹☆繧九・
驕ｩ逕ｨ貂医∩縲ょ・驕ｩ逕ｨ繝ｻ蛻･迺ｰ蠅・畑縺ｮ萓・

```powershell
npx wrangler d1 create sns-mnm-pro-prod
npx wrangler d1 migrations apply sns-mnm-pro-prod --remote
```

## D1繝・・繝悶Ν險ｭ險・
### users

繝ｦ繝ｼ繧ｶ繝ｼ譛ｬ菴薙ゅΟ繧ｰ繧､繝ｳ縲∵ｨｩ髯舌√・繝ｩ繝ｳ蛻､螳壹↓菴ｿ縺・・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | user id |
| email | TEXT | yes | login email, unique index |
| display_name | TEXT | no | display name |
| password_hash | TEXT | yes | PBKDF2/Argon2/bcrypt遲峨・繝上ャ繧ｷ繝･縲ょｹｳ譁・ｦ∵ｭ｢ |
| password_algo | TEXT | yes | hash algorithm |
| role | TEXT | yes | user / admin |
| plan | TEXT | yes | trial / lite / pro / admin_full |
| status | TEXT | yes | active / suspended / expired / deleted |
| trial_started_at | TEXT | no | free trial start timestamp |
| trial_expires_at | TEXT | no | free trial expires at 3 days after start |
| trial_status | TEXT | no | active / expired / converted / canceled |
| created_at, updated_at, last_login_at | TEXT | partial | timestamps |

Indexes: `email`, `role`, `plan`, `status`, `trial_status`, `trial_expires_at`

### licenses

繝ｩ繧､繧ｻ繝ｳ繧ｹ逋ｺ陦後・蛻晏屓逋ｻ骭ｲ逕ｨ縲ょ・譁・く繝ｼ縺ｯ菫晏ｭ倥＠縺ｪ縺・・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | license id |
| license_hash | TEXT | yes | normalized key + pepper 縺ｮhash縲「nique |
| license_last4 | TEXT | yes | 邂｡逅・判髱｢陦ｨ遉ｺ逕ｨ譛ｫ蟆ｾ4譯・|
| email | TEXT | yes | 邏舌▼縺台ｺ亥ｮ壹Γ繝ｼ繝ｫ |
| plan | TEXT | yes | trial / lite / pro / admin_full |
| status | TEXT | yes | unused / active / suspended / expired / revoked |
| issued_at, activated_at, expires_at | TEXT | partial | lifecycle timestamps |
| user_id | TEXT | no | active蠕後・user |
| buyer_name, payment_name, stripe_payment_id, memo | TEXT | no | 驕狗畑邂｡逅・畑 |
| created_by_admin_id | TEXT | no | 逋ｺ陦檎ｮ｡逅・・|

Indexes: `license_hash`, `email`, `user_id`, `status`, `plan`

### sessions

繝ｭ繧ｰ繧､繝ｳ繧ｻ繝・す繝ｧ繝ｳ縲・ookie縺ｮ逕溘ヨ繝ｼ繧ｯ繝ｳ縺ｯDB縺ｫ菫晏ｭ倥＠縺ｪ縺・・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | session id |
| user_id | TEXT | yes | owner |
| session_token_hash | TEXT | yes | Cookie token + pepper 縺ｮhash縲「nique |
| expires_at | TEXT | yes | expiry |
| created_at, updated_at | TEXT | yes | timestamps |
| user_agent_hash, ip_hash | TEXT | no | 霑ｽ霍｡逕ｨhash縲ら函蛟､菫晏ｭ倥ｒ驕ｿ縺代ｋ |
| revoked_at | TEXT | no | logout / revoke |

Indexes: `session_token_hash`, `user_id`, `expires_at`, `revoked_at`

### applications

逕ｳ縺苓ｾｼ縺ｿ繝輔か繝ｼ繝騾∽ｿ｡蜀・ｮｹ縲・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | application id |
| name, payment_name, email | TEXT | yes | 逕ｳ霎ｼ閠・ュ蝣ｱ |
| plan | TEXT | yes | trial / lite / pro |
| purpose | TEXT | yes | 蛻ｩ逕ｨ逶ｮ逧・|
| threads_url, x_url, referral_source, note | TEXT | no | optional |
| consent_* | INTEGER | yes | 蜷梧э繝√ぉ繝・け |
| payment_status | TEXT | yes | pending / confirmed / mismatch / canceled |
| license_status | TEXT | yes | not_issued / issued |
| stripe_payment_id | TEXT | no | Stripe辣ｧ蜷育畑 |
| created_at, updated_at | TEXT | yes | timestamps |

Indexes: `email`, `plan`, `payment_status`, `license_status`

### payments

螢ｲ荳顔ｮ｡逅・畑縲４tripe騾｣謳ｺ蠕後・Webhook邨先棡繧ゅ％縺薙↓菫晏ｭ倥☆繧九・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | payment id |
| application_id, user_id | TEXT | no | related records |
| buyer_name, payment_name, email | TEXT | yes | 豎ｺ貂育・蜷・|
| plan | TEXT | yes | trial / lite / pro |
| amount | INTEGER | yes | yen amount |
| currency | TEXT | yes | JPY |
| provider | TEXT | yes | stripe / square |
| provider_payment_id | TEXT | no | Stripe豎ｺ貂・D |
| payment_status | TEXT | yes | pending / confirmed / mismatch / refunded / canceled |
| license_status | TEXT | yes | not_issued / issued |
| license_id | TEXT | no | 逋ｺ陦梧ｸ医∩license |
| paid_at, confirmed_at, created_at, updated_at | TEXT | partial | timestamps |
| confirmed_by_admin_id, memo | TEXT | no | 邂｡逅・ュ蝣ｱ |

Indexes: `provider_payment_id`, `email`, `payment_status`, `license_status`, `plan`

### subscriptions

譛磯｡榊･醍ｴ・ュ蝣ｱ縲ょ・譛溘・Payment Links驕狗畑縺ｮ縺溘ａ遨ｺ縺ｧ繧ゅｈ縺・・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | subscription id |
| user_id | TEXT | yes | owner |
| plan | TEXT | yes | lite / pro / admin_full |
| payment_provider | TEXT | no | stripe |
| provider_customer_id, provider_subscription_id | TEXT | no | Stripe IDs |
| status | TEXT | yes | active / trialing / past_due / canceled / manual |
| current_period_start, current_period_end | TEXT | no | billing period |
| created_at, updated_at | TEXT | yes | timestamps |

Indexes: `user_id`, `plan`, `status`, `provider_customer_id`

### usage_counters

AI/Threads usage counters. Free trial is now period-based for 3 days, not per-feature 5-use limits.
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | counter id |
| user_id | TEXT | yes | owner |
| feature_key | TEXT | yes | ai_post / one_day / threads_api_test 遲・|
| used_count | INTEGER | yes | usage count |
| limit_count | INTEGER | no | monthly limits or future paid-plan limits |
| reset_period | TEXT | yes | none / monthly |
| updated_at | TEXT | yes | timestamp |

Indexes: `(user_id, feature_key) unique`, `feature_key`

### ai_settings

OpenAI API繧ｭ繝ｼ縺ｨ蜈ｱ騾壹・繝ｭ繝輔ぅ繝ｼ繝ｫ縲ょ・譁・｡ｨ遉ｺ遖∵ｭ｢縲・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | settings id |
| user_id | TEXT | yes | owner, unique |
| openai_key_encrypted | TEXT | no | AES-GCM證怜捷蛹・|
| openai_key_last4 | TEXT | no | 陦ｨ遉ｺ逕ｨ譛ｫ蟆ｾ4譁・ｭ・|
| model_mode | TEXT | yes | low_cost / standard / high_quality |
| profile_json_encrypted | TEXT | no | 蜈ｱ騾壹・繝ｭ繝輔ぅ繝ｼ繝ｫ繧呈囓蜿ｷ蛹・|
| encryption_key_version | TEXT | yes | key rotation |
| created_at, updated_at | TEXT | yes | timestamps |

Indexes: `user_id`

### threads_connections

Threads API謗･邯壽ュ蝣ｱ縲５oken/Secret蜈ｨ譁・｡ｨ遉ｺ遖∵ｭ｢縲・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | connection id |
| user_id | TEXT | yes | owner, unique |
| meta_app_id | TEXT | no | App ID |
| meta_app_secret_encrypted | TEXT | no | AES-GCM證怜捷蛹・|
| meta_app_secret_last4 | TEXT | no | 陦ｨ遉ｺ逕ｨ譛ｫ蟆ｾ4譁・ｭ・|
| threads_user_id | TEXT | no | Threads User ID |
| access_token_encrypted | TEXT | no | AES-GCM證怜捷蛹・|
| access_token_last4 | TEXT | no | 陦ｨ遉ｺ逕ｨ譛ｫ蟆ｾ4譁・ｭ・|
| token_expires_at | TEXT | no | token expiry |
| connection_status | TEXT | yes | disconnected / connected / error / expired |
| last_error | TEXT | no | sanitized error only |
| last_tested_at, last_synced_at | TEXT | no | timestamps |
| last_followers_count, previous_followers_count | INTEGER | no | Lite繝輔か繝ｭ繝ｯ繝ｼ邂｡逅・|
| previous_synced_at | TEXT | no | comparison base |
| created_at, updated_at | TEXT | yes | timestamps |

Indexes: `user_id`, `connection_status`, `threads_user_id`

### generated_posts

謚慕ｨｿ邂｡逅・・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | post id |
| user_id | TEXT | yes | owner |
| type | TEXT | yes | ai_post / one_day / rewrite 遲・|
| created_at | TEXT | yes | timestamp |
| topic, target, purpose | TEXT | no | generation context |
| platform | TEXT | yes | Threads / X / Both |
| content | TEXT | yes | generated content |
| cta | TEXT | no | 謚慕ｨｿ縺ｮ邱繧∵枚繝ｻ隱伜ｰ取枚 |
| status | TEXT | yes | draft / scheduled_memo / posted / failed |
| scheduled_at | TEXT | no | memo schedule |

Indexes: `user_id`, `type`, `status`, `platform`, `created_at`

### generation_history

AI逕滓・螻･豁ｴ縲ょ・蛻ｩ逕ｨ繝ｻ繧ｳ繝斐・繝ｻ謚慕ｨｿ邂｡逅・ｿ晏ｭ倥↓菴ｿ縺・・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | history id |
| user_id | TEXT | yes | owner |
| feature_key | TEXT | yes | AI feature |
| input_json | TEXT | yes | input snapshot. secrets遖∵ｭ｢ |
| output_json | TEXT | yes | output |
| created_at | TEXT | yes | timestamp |

Indexes: `user_id`, `feature_key`, `created_at`

### winning_patterns

Pro髯仙ｮ壹・蜍昴■繝代ち繝ｼ繝ｳ霎樊嶌縲・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | pattern id |
| user_id | TEXT | yes | owner |
| name | TEXT | yes | pattern name |
| post_type | TEXT | no | 謚慕ｨｿ繧ｿ繧､繝・|
| opening_pattern, body_structure, closing_cta | TEXT | no | reusable structure |
| reason_why_it_worked, genre, memo | TEXT | no | analysis notes |
| score | INTEGER | no | optional score |
| last_used_at, created_at, updated_at | TEXT | partial | timestamps |

Indexes: `user_id`, `post_type`, `genre`

### scheduled_posts

Threads莠育ｴ・兜遞ｿ縺ｨX莠育ｴ・Γ繝｢縲・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | scheduled id |
| user_id | TEXT | yes | owner |
| platform | TEXT | yes | Threads / X |
| content | TEXT | yes | content |
| scheduled_at | TEXT | yes | due time |
| status | TEXT | yes | draft / scheduled / posted / failed / canceled |
| threads_post_id | TEXT | no | success result |
| error_message | TEXT | no | sanitized error |
| created_at, updated_at | TEXT | yes | timestamps |

Indexes: `user_id`, `status`, `scheduled_at`, `platform`

### admin_audit_logs

邂｡逅・・桃菴懊Ο繧ｰ縲よ隼縺悶ｓ髦ｲ豁｢縺ｮ縺溘ａ蜑企勁UI縺ｯ菴懊ｉ縺ｪ縺・・
| column | type | required | meaning / security |
| --- | --- | --- | --- |
| id | TEXT | yes | log id |
| admin_user_id | TEXT | yes | actor |
| action | TEXT | yes | license_issue / plan_change 遲・|
| target_type | TEXT | yes | user / license / payment |
| target_id | TEXT | no | target id |
| detail_json | TEXT | no | 蟾ｮ蛻・Ｔecret/token/password遖∵ｭ｢ |
| created_at | TEXT | yes | timestamp |

Indexes: `admin_user_id`, `action`, `(target_type, target_id)`, `created_at`

## KV繧ｻ繝・す繝ｧ繝ｳ險ｭ險・
D1繧呈ｭ｣縺ｨ縺励゜V縺ｯ繧ｻ繝・す繝ｧ繝ｳ縺ｮ鬮倬溽｢ｺ隱阪く繝｣繝・す繝･縺ｫ縺吶ｋ縲・
- Cookie蜷・ `sns_mnm_session`
- Cookie蛟､: 謗ｨ貂ｬ蝗ｰ髮｣縺ｪ繝ｩ繝ｳ繝繝繝医・繧ｯ繝ｳ
- Cookie螻樊ｧ: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=...`
- KV key: `session:${session_token_hash}`
- KV value: `{"userId":"...","role":"admin","plan":"admin_full","expiresAt":"..."}`
- KV TTL: 繧ｻ繝・す繝ｧ繝ｳ譛滄剞莉･荳・- D1: `sessions.session_token_hash` 繧剃ｿ晏ｭ・- logout/revoke: D1縺ｫ `revoked_at` 繧貞・繧後゜V繧ょ炎髯､

邂｡逅・・そ繝・す繝ｧ繝ｳ縺ｯ荳闊ｬ繝ｦ繝ｼ繧ｶ繝ｼ繧医ｊ遏ｭ繧√↓縺吶ｋ縲・
## Cloudflare Secrets險ｭ險・
譛ｬ逡ｪ縺ｧ險ｭ螳壹☆繧鬼ecrets蛟呵｣懊・
| secret | purpose |
| --- | --- |
| APP_SECRET | 繝ｩ繧､繧ｻ繝ｳ繧ｹhash縲《ession token hash縲｝assword hash pepper縲∥dmin bootstrap菫晁ｭｷ |
| ENCRYPTION_KEY | 豎守畑證怜捷蛹也畑縲ょｾ檎ｶ壹〒蜈ｱ騾壽ｩ溷ｯ・↓菴ｿ逕ｨ |
| OPENAI_ENCRYPTION_KEY | 雉ｼ蜈･閠・penAI API繧ｭ繝ｼ縺ｮAES-GCM證怜捷蛹・|
| THREADS_ENCRYPTION_KEY | Threads Access Token / Meta App Secret縺ｮAES-GCM證怜捷蛹・|
| STRIPE_SECRET_KEY | 蠕檎ｶ售tripe API逕ｨ |

繧ｵ繝ｼ繝薙せ謠蝉ｾ幄・・縺ｮOpenAI API繧ｭ繝ｼ縺ｯ鄂ｮ縺九↑縺・りｳｼ蜈･閠・・霄ｫ縺ｮ繧ｭ繝ｼ繧呈囓蜿ｷ蛹紋ｿ晏ｭ倥＠縺ｦ菴ｿ縺・・
## 證怜捷蛹悶・繝上ャ繧ｷ繝･蛹匁婿驥・
- Password: 蟷ｳ譁・ｦ∵ｭ｢縲８orkers Web Crypto縺ｮPBKDF2-SHA256縲《alt莉倥″縲～APP_SECRET` pepper菴ｵ逕ｨ縲・- License key: `normalize -> APP_SECRET莉倥″SHA-256`縲ょ・譁・ｿ晏ｭ倡ｦ∵ｭ｢縲り｡ｨ遉ｺ縺ｯ譛ｫ蟆ｾ4譯√・縺ｿ縲・- Session token: Cookie縺ｫ逕溘ヨ繝ｼ繧ｯ繝ｳ縲．1/KV縺ｫ縺ｯ`APP_SECRET`莉倥″hash縺ｮ縺ｿ縲・- OpenAI API key: `OPENAI_ENCRYPTION_KEY`縺ｧAES-GCM證怜捷蛹悶り｡ｨ遉ｺ縺ｯ譛ｫ蟆ｾ4譁・ｭ励・縺ｿ縲・- Threads Access Token: `THREADS_ENCRYPTION_KEY`縺ｧAES-GCM證怜捷蛹悶り｡ｨ遉ｺ縺ｯ譛ｫ蟆ｾ4譁・ｭ励・縺ｿ縲・- Meta App Secret: `THREADS_ENCRYPTION_KEY`縺ｧAES-GCM證怜捷蛹悶り｡ｨ遉ｺ縺ｯ譛ｫ蟆ｾ4譁・ｭ励・縺ｿ縲・- Logs: secret/token/password/license蜈ｨ譁・ｒ蜃ｺ縺輔↑縺・・
蜈ｱ騾壹・繝ｫ繝代・縺ｯ `functions/_lib/security.js` 縺ｫ菴懈・貂医∩縲・
## /admin 菫晁ｭｷ繝輔Ο繝ｼ

譛ｬ驕狗畑縺ｧ縺ｯ `/admin` 縺ｾ縺溘・ `/admin.html` 繧偵ヵ繝ｭ繝ｳ繝亥愛螳壹□縺代〒螳医ｉ縺ｪ縺・・
1. Request Cookie縺九ｉ `sns_mnm_session` 繧貞叙蠕・2. `APP_SECRET` 縺ｧsession token hash繧剃ｽ懊ｋ
3. `SESSION_KV` 縺ｫ `session:${hash}` 縺後≠繧後・譛滄剞縺ｨrole繧堤｢ｺ隱・4. KV miss譎ゅ・D1 `sessions` 縺ｨ `users` 繧谷OIN縺励※遒ｺ隱・5. `expires_at > now` 縺九▽ `revoked_at IS NULL` 繧堤｢ｺ隱・6. `users.status = active` 繧堤｢ｺ隱・7. `users.role = admin` 縺ｮ蝣ｴ蜷医・縺ｿ邂｡逅・判髱｢HTML/API繧定ｿ斐☆
8. 縺昴ｌ莉･螟悶・403縺ｾ縺溘・繝ｭ繧ｰ繧､繝ｳ逕ｻ髱｢縺ｸ謌ｻ縺・
邂｡逅・PI繧ょ酔縺・`requireAdminUser` 繧貞ｿ・★騾壹☆縲・
迴ｾ蝨ｨ縺ｯ `functions/_middleware.js` 縺ｧ `/admin`縲～/admin.html`縲～/api/admin/*` 繧偵し繝ｼ繝舌・蛛ｴ菫晁ｭｷ貂医∩縲・`/api/admin/bootstrap` 縺ｯ萓句､悶□縺後～ALLOW_ADMIN_BOOTSTRAP=true` 縺九▽ `X-App-Secret` 縺・`APP_SECRET` 縺ｨ荳閾ｴ縺吶ｋ蝣ｴ蜷医・縺ｿ蜍輔￥縲・
## 蛻晄悄admin菴懈・謇矩・
螳牙・諤ｧ蜆ｪ蜈医〒縲・壼ｸｸ縺ｯbootstrap繧堤┌蜉ｹ蛹悶＠縺ｦ縺・ｋ縲・
1. 荳譎ら噪縺ｫ `ALLOW_ADMIN_BOOTSTRAP` 繧・`true` 縺ｫ螟画峩縺励※繝・・繝ｭ繧､縺吶ｋ
2. `APP_SECRET` 繧堤ｮ｡逅・・悽莠ｺ縺縺代′蛻・°繧句､縺ｨ縺励※Cloudflare Pages Secret縺ｸ險ｭ螳壹☆繧・3. `POST /api/admin/bootstrap` 縺ｫ `X-App-Secret: <APP_SECRET>` 繧剃ｻ倥￠縺ｦ縲∫ｮ｡逅・・mail/password繧帝√ｋ
4. 菴懈・謌仙粥蠕後√☆縺・`ALLOW_ADMIN_BOOTSTRAP=false` 縺ｫ謌ｻ縺励※蜀阪ョ繝励Ο繧､縺吶ｋ

PowerShell萓・

```powershell
$body = @{
  email = "admin@example.com"
  password = "12譁・ｭ嶺ｻ･荳翫・蠑ｷ縺・ヱ繧ｹ繝ｯ繝ｼ繝・
  display_name = "KOUCHA-LAB Admin"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://sns-mnm-pro-prototype.pages.dev/api/admin/bootstrap" `
  -Method Post `
  -Headers @{ "X-App-Secret" = "<APP_SECRET>" } `
  -ContentType "application/json" `
  -Body $body
```

縺薙・API縺ｯ邂｡逅・・′1蜷阪〒繧ょｭ伜惠縺吶ｋ縺ｨ409繧定ｿ斐☆縲・
## Threads API譛ｬ謗･邯壹∪縺ｧ縺ｮ謇矩・
1. 險ｭ螳夂判髱｢縺ｮThreads API蜈･蜉帛､繧淡orkers縺ｸPOST縺吶ｋ
2. Workers蛛ｴ縺ｧ繝ｭ繧ｰ繧､繝ｳ貂医∩user繧堤｢ｺ隱阪☆繧・3. App Secret縺ｨAccess Token繧・`THREADS_ENCRYPTION_KEY` 縺ｧ證怜捷蛹・4. `threads_connections` 縺ｫ菫晏ｭ倥＠縲〕ast4縺縺題ｿ斐☆
5. 謗･邯壹ユ繧ｹ繝域凾縺ｯWorkers蛛ｴ縺ｧ蠕ｩ蜿ｷ
6. Workers蛛ｴ縺九ｉThreads API縺ｫ繝・せ繝医Μ繧ｯ繧ｨ繧ｹ繝・7. 謌仙粥縺ｪ繧・`connection_status=connected`, `last_tested_at` 譖ｴ譁ｰ
8. 螟ｱ謨励↑繧・`connection_status=error`, sanitized `last_error` 譖ｴ譁ｰ
9. 繝輔か繝ｭ繝ｯ繝ｼ謨ｰ蜿門ｾ励ユ繧ｹ繝医〒 `last_followers_count`, `previous_followers_count`, `last_synced_at` 繧呈峩譁ｰ
10. 繝輔か繝ｭ繝ｯ繝ｼ謨ｰ邂｡逅・・繝ｼ繧ｸ縺ｸD1蛟､繧定ｿ斐☆

繝輔Ο繝ｳ繝医↓縺ｯSecret/Token蜈ｨ譁・ｒ霑斐＆縺ｪ縺・・
## Threads閾ｪ蜍墓兜遞ｿ縺ｾ縺ｧ縺ｮ謇矩・
1. 繧ｹ繧ｱ繧ｸ繝･繝ｼ繝ｩ繝ｼUI縺九ｉ `scheduled_posts` 縺ｫ菫晏ｭ・2. Threads API謗･邯壽ｸ医∩縺ｧ縺ｪ縺・ｴ蜷医・Threads莠育ｴ・兜遞ｿ繝懊ち繝ｳ繧堤┌蜉ｹ蛹・3. Workers Cron Trigger繧・蛻・俣髫斐↑縺ｩ縺ｧ襍ｷ蜍・4. `status='scheduled' AND scheduled_at <= now` 繧奪1縺九ｉ蜿門ｾ・5. 蟇ｾ雎｡繝ｦ繝ｼ繧ｶ繝ｼ縺ｮ `threads_connections` 繧貞叙蠕励＠Access Token繧貞ｾｩ蜿ｷ
6. Threads API縺ｸ謚慕ｨｿ
7. 謌仙粥譎・ `status='posted'`, `threads_post_id`, `updated_at` 菫晏ｭ・8. 螟ｱ謨玲凾: `status='failed'`, sanitized `error_message` 菫晏ｭ・9. 邂｡逅・・屮譟ｻ繝ｭ繧ｰ縺ｨ繝ｦ繝ｼ繧ｶ繝ｼ逕ｻ髱｢縺ｫ邨先棡繧貞渚譏

X縺ｯ縺薙・繝輔Ο繝ｼ縺ｫ蜈･繧後↑縺・９縺ｯ繧ｳ繝斐・繝ｻ莠育ｴ・Γ繝｢邂｡逅・・縺ｿ縲・
## 螟画峩繝輔ぃ繧､繝ｫ蛟呵｣・
莉雁屓霑ｽ蜉貂医∩:

- `migrations/0001_initial_schema.sql`
- `functions/_lib/security.js`
- `docs/backend-foundation.md`
- `wrangler.example.jsonc`

蠕檎ｶ壹〒霑ｽ蜉蛟呵｣・

- `functions/_middleware.js` 縺ｾ縺溘・ `functions/admin/[[path]].js`
- `functions/api/auth/login.js`
- `functions/api/auth/register.js`
- `functions/api/settings/openai.js`
- `functions/api/settings/threads.js`
- `functions/api/admin/*.js`
- `functions/api/scheduler/*.js`
- `functions/scheduled.js` 縺ｾ縺溘・Worker Cron蟆ら畑繧ｨ繝ｳ繝医Μ

## 縺ｾ縺螳溯｣・＠縺ｪ縺・婿縺後ｈ縺・・岼

- 譛ｬ逡ｪThreads謚慕ｨｿ縺ｮ螳滄∽ｿ｡
- X API騾｣謳ｺ
- X閾ｪ蜍墓兜遞ｿ
- X蛻・梵蜿門ｾ・- Stripe Webhook閾ｪ蜍輔Λ繧､繧ｻ繝ｳ繧ｹ逋ｺ陦・- 邂｡逅・判髱｢縺ｮ譛ｬ逡ｪ繧ｬ繝ｼ繝画怏蜉ｹ蛹・- OpenAI API螳滄∽ｿ｡
- Threads Access Token繧ОpenAI API繧ｭ繝ｼ縺ｮ繝輔Ο繝ｳ繝井ｿ晏ｭ・
荳願ｨ倥・D1/KV/Secrets縺ｮ譛ｬ逡ｪbinding縺ｨ隱崎ｨｼAPI繧貞・縺ｫ蝗ｺ繧√※縺九ｉ騾ｲ繧√ｋ縲・
