# Deploy web do AgendeAqui

O app roda como uma aplicacao React/Vite estatica. A entrega web usa:

- comando de build: `npm run build`
- pasta de publicacao: `dist`
- variaveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

Nao coloque `service_role` no frontend. Chaves administrativas continuam apenas nos secrets das Edge Functions do Supabase.

## Vercel

1. Framework: Vite
2. Build command: `npm run build`
3. Output directory: `dist`
4. Configure as variaveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

O arquivo `vercel.json` ja possui rewrite para SPA.

## Netlify

1. Build command: `npm run build`
2. Publish directory: `dist`
3. Configure as variaveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

O arquivo `public/_redirects` ja possui fallback para `index.html`.

## Supabase Auth

Quando a URL final existir, adicione no Supabase:

- Site URL
- Redirect URLs

Exemplos:

- `http://localhost:5173`
- `https://agende-aqui.vercel.app`
- `https://seudominio.com.br`
