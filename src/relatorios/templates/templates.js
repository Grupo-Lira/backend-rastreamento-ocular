import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TemplateManager {
  constructor() {
    this.templatesDir = __dirname;
  }

  getTemplate(templateName) {
    const templatePath = path.join(this.templatesDir, templateName);
    return fs.readFileSync(templatePath, "utf-8");
  }

  getHtmlTemplate() {
    return this.getTemplate("relatorio.html");
  }

  processarTemplate(pacienteData) {
    const htmlTemplate = this.getHtmlTemplate();

    const m = pacienteData.metricas || {};

    let htmlFinal = htmlTemplate
      .replace(/{{NOME_PACIENTE}}/g, pacienteData.nome || "")
      .replace(/{{RG}}/g, pacienteData.rg || "---")
      .replace(/{{SEXO}}/g, pacienteData.sexo || "---")
      .replace(/{{DATA_NASCIMENTO}}/g, pacienteData.dataNascimento || "---")
      .replace(/{{DATA_AVALIACAO}}/g, pacienteData.dataAvaliacao || "---")
      .replace(/{{ESCOLARIDADE}}/g, pacienteData.escolaridade || "---")
      .replace(/{{MOTIVO_AVALIACAO}}/g, pacienteData.motivoAvaliacao || "---")

      .replace(
        /{{OBSERVACOES}}/g,
        pacienteData.observacoes || "Nenhuma observação.",
      )
      .replace(
        /{{OBSERVACOES_IA}}/g,
        pacienteData.observacoesIA || "Sem análise de IA disponível.",
      )

      .replace(/{{ACERTOS}}/g, m.acertos || "0")

      .replace(/{{METRICAS_CONTENT}}/g, this.gerarHtmlMetricas(m))

      .replace(
        /{{DADOS_COMPARATIVOS_CONTENT}}/g,
        this.gerarHtmlGrafico(m, pacienteData),
      )

      .replace(
        /{{OBSERVACOES_CONTENT}}/g,
        this.gerarHtmlObservacoes(
          pacienteData.observacoes,
          pacienteData.observacoesIA,
        ),
      );

    return htmlFinal;
  }

  gerarHtmlMetricas(metricas) {
    return `
    <div class="metrics-grid">
        <div class="metric-item">
            <div class="metric-item-label">🕒 TEMPO DE REAÇÃO</div>
            <div class="metric-item-value">${metricas.tempoReacao || "---"}</div>
        </div>
        <div class="metric-item">
            <div class="metric-item-label">📈 VARIABILIDADE</div>
            <div class="metric-item-value">${metricas.variabilidadeTemporalRespostas || "---"}</div>
        </div>
        <div class="metric-item">
            <div class="metric-item-label"><span style="color:#00C48C">●</span> ACERTOS</div>
            <div class="metric-item-value">${metricas.acertos || "0"}</div>
        </div>
        <div class="metric-item">
            <div class="metric-item-label"><span style="color:#E10000">✕</span> OMISSÕES</div>
            <div class="metric-item-value value-red">${metricas.errosOmissao || "0"}</div>
        </div>
        <div class="metric-item">
            <div class="metric-item-label"><span style="color:#E10000">⚠</span> COMISSÕES</div>
            <div class="metric-item-value value-red">${metricas.errosComissao || "0"}</div>
        </div>
    </div>
`;
  }

  gerarHtmlObservacoes(observacoes, observacoesIA) {
    return `
    <div class="details-grid">
        <div class="obs-section">
            <div class="obs-title">Observações da IA</div>
            <div class="obs-content">${observacoesIA || "Sem análise de IA disponível."}</div>
        </div>
        <div class="obs-section">
            <div class="obs-title">Observações Gerais</div>
            <div class="obs-content">${observacoes || "Nenhuma observação."}</div>
        </div>
    </div>
`;
  }

  gerarHtmlGrafico(metricas, pacienteData) {
  if (!metricas || !metricas.dadosComparativos) return "";

  let dados = metricas.dadosComparativos;
  if (!Array.isArray(dados)) {
    dados = Object.entries(dados)
      .map(([idade, valores]) => ({
        idade: parseInt(idade, 10),
        mediaAcertos: valores.acertosMedios || 0,
      }))
      .sort((a, b) => a.idade - b.idade);
  }

  if (dados.length === 0) return "";

  const acertosPaciente = metricas.acertos || 0;
  const idadePaciente = pacienteData.idade || metricas.idade || 0;

  // --- CÁLCULOS DE ESCALA DINÂMICA ---
  const todasMedias = dados.map(d => d.mediaAcertos);
  // O teto do gráfico deve ser o maior entre (média máxima, acertos do paciente ou um mínimo de 10)
  const valorMaximoReal = Math.max(...todasMedias, acertosPaciente, 10);
  const maxAcertos = Math.ceil(valorMaximoReal / 2) * 2; // Arredonda para cima para número par

  // Gerar labels do eixo Y dinamicamente (6 faixas)
  const labelsY = [];
  for (let i = 5; i >= 0; i--) {
    labelsY.push(Math.round((maxAcertos / 5) * i));
  }

  const width = 300; // Aumentado para melhor resolução interna
  const height = 150;
  const paddingSide = 25;
  const paddingTop = 30; // Espaço para o pin "VOCÊ" não cortar
  const paddingBottom = 20;

  const getX = (index) => paddingSide + (index * (width - 2 * paddingSide)) / (dados.length - 1 || 1);
  const getY = (val) => {
    const availableHeight = height - paddingTop - paddingBottom;
    return height - paddingBottom - (val * availableHeight) / maxAcertos;
  };

  const points = dados.map((d, i) => `${getX(i)},${getY(d.mediaAcertos)}`).join(" ");
    const fillPath = `M ${getX(0)},${height - paddingBottom} L ${points} L ${getX(dados.length - 1)},${height - paddingBottom} Z`;

    let indexPaciente = dados.findIndex((d) => d.idade === idadePaciente);
    if (indexPaciente === -1) {
      // Se não achar a idade exata, interpola a posição X
      const idades = dados.map(d => d.idade);
      const minIdade = Math.min(...idades);
      const maxIdade = Math.max(...idades);
      indexPaciente = (idadePaciente - minIdade) / (maxIdade - minIdade) * (dados.length - 1);
    }

    const xVoce = getX(indexPaciente);
    const yVoce = getY(acertosPaciente);

    return `
    <div class="chart-container" style="font-family: 'Segoe UI', Tahoma, sans-serif; width: 100%; max-width: 550px; background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div style="font-size: 11px; color: #1e293b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Desempenho Comparativo</div>
            <div class="chart-legend" style="display: flex; gap: 12px; font-size: 10px; font-weight: 600;">
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 2px; background: #FF7A00;"></span> Média
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 2px; background: #00C48C;"></span> Paciente
                </div>
            </div>
        </div>

        <div style="display: flex; align-items: stretch; height: 200px;">
            <div style="display: flex; flex-direction: column; justify-content: space-between; padding: ${paddingTop}px 8px ${paddingBottom}px 0; font-size: 10px; color: #94A3B8; text-align: right; width: 25px;">
                ${labelsY.map((label) => `<span>${label}</span>`).join("")}
            </div>

            <div style="flex-grow: 1; position: relative;">
                <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%; overflow: visible;">
                    <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:#FF7A00; stop-opacity:0.15" />
                            <stop offset="100%" style="stop-color:#FF7A00; stop-opacity:0" />
                        </linearGradient>
                    </defs>

                    ${labelsY.map(val => `
                      <line x1="0" y1="${getY(val)}" x2="${width}" y2="${getY(val)}" stroke="#F1F5F9" stroke-width="1" />
                    `).join("")}

                    <path d="${fillPath}" fill="url(#grad)" />
                    <polyline points="${points}" fill="none" stroke="#FF7A00" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />

                    ${dados.map((d, i) => `
                      <circle cx="${getX(i)}" cy="${getY(d.mediaAcertos)}" r="3" fill="#fff" stroke="#FF7A00" stroke-width="1.5" />
                    `).join("")}

                    <g transform="translate(${xVoce}, ${yVoce})">
                        <path d="M -15 -35 H 15 V -15 H 5 L 0 -8 L -5 -15 H -15 Z" fill="#00C48C" />
                        <text x="0" y="-21" font-size="7" fill="white" text-anchor="middle" font-weight="900">VOCÊ</text>
                        <circle cx="0" cy="0" r="5" fill="#00C48C" stroke="#fff" stroke-width="2" />
                    </g>
                </svg>
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-left: 33px; padding-top: 10px; border-top: 1px solid #F1F5F9;">
            ${dados.map((d) => `<span style="font-size: 10px; color: #64748b; font-weight: 700;">${d.idade}a</span>`).join("")}
        </div>
        <div style="text-align: center; margin-top: 8px; font-size: 9px; color: #94A3B8; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">
            Faixa Etária (Anos)
        </div>
    </div>
    `;
  }
}

export default new TemplateManager();
