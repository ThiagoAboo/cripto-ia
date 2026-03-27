# Pente-fino visual — fase 2

Este overlay foi montado com base no estado atual do GitHub em `main`.

## O que ele faz

- refina o shell visual do painel (`AppShell`, `SidebarNav`, `styles.css`)
- melhora os subtítulos do cabeçalho por página (`dashboard-pages.js`)
- garante a resposta em `GET /api/system`

## Como aplicar

1. Extraia este ZIP na raiz do projeto.
2. Aceite sobrescrever os arquivos.
3. Reinicie backend e frontend.

## Comandos

```powershell
cd D:\Projetos\cripto-ia
docker compose up --build -d backend frontend
```

## Validação

```powershell
curl.exe -fsS http://localhost:4000/api/system
curl.exe -fsS http://localhost:4000/api/system/manifest
```

Depois abra:

- http://localhost:5173

E confira:

- menu lateral
- cabeçalho das páginas
- cards/tabelas/listas
- dashboard, configuração, operações, execução, governança, social e treinamento
