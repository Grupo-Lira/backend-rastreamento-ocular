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
    if (
      !metricas ||
      !metricas.dadosComparativos ||
      metricas.dadosComparativos.length === 0
    )
      return "";

    console.log(
      `[TEMPLATE] Idade recebida no gráfico: ${pacienteData.idade || metricas.idade || 0} anos`,
    );

    const dados = metricas.dadosComparativos;
    const acertosPaciente = metricas.acertos || 0;
    const idadePaciente = pacienteData.idade || metricas.idade || 0;

    const width = 200;
    const height = 100;
    const paddingY = 10;
    const maxAcertos = Math.max(10, acertosPaciente);
    const labelsY = [10, 8, 6, 4, 2, 0];

    const getX = (index) =>
      20 + (index * (width - 40)) / (dados.length - 1 || 1);
    const getY = (val) => {
      const availableHeight = height - 2 * paddingY;
      return height - paddingY - (val * availableHeight) / maxAcertos;
    };

    const points = dados
      .map((d, i) => `${getX(i)},${getY(d.mediaAcertos)}`)
      .join(" ");
    const fillPath = `M ${getX(0)},${height} L ${points} L ${getX(dados.length - 1)},${height} Z`;

    let indexPaciente = dados.findIndex((d) => d.idade === idadePaciente);
    if (indexPaciente === -1) indexPaciente = Math.floor(dados.length / 2);

    const xVoce = getX(indexPaciente);
    const yVoce = getY(acertosPaciente);

    return `
  <div class="chart-container" style="font-family: sans-serif; width: 100%; max-width: 600px; margin-top: 20px;">
      <div class="chart-legend" style="display: flex; gap: 15px; margin-bottom: 20px; font-size: 11px;">
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #FF7A00;"></span>
            Média por idade
          </div>
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #00C48C;"></span>
            Paciente atual (${acertosPaciente} acertos)
          </div>
      </div>

      <div style="font-size: 10px; color: #666; margin-bottom: 10px; font-weight: bold; text-transform: uppercase;">
          Média de Acertos
      </div>

      <div style="display: flex; align-items: stretch; height: 150px;">
          <div style="display: flex; flex-direction: column; justify-content: space-between; padding: ${paddingY}px 10px ${paddingY}px 0; font-size: 11px; color: #94A3B8; text-align: right; width: 30px; line-height: 1;">
              ${labelsY.map((label) => `<span>${label}</span>`).join("")}
          </div>

          <div style="flex-grow: 1; position: relative; border-left: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0;">
              <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width: 100%; height: 100%; display: block;">
                  <defs>
                      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.2"/>
                      </filter>

                      <linearGradient id="gradPreenchimento" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style="stop-color:#FF7A00; stop-opacity:0.2" />
                          <stop offset="100%" style="stop-color:#FF7A00; stop-opacity:0" />
                      </linearGradient>
                  </defs>

                  ${labelsY
                    .map(
                      (val) => `
                    <line x1="0" y1="${getY(val)}" x2="${width}" y2="${getY(val)}" stroke="#F1F5F9" stroke-width="1" />
                  `,
                    )
                    .join("")}

                  <path d="${fillPath}" fill="url(#gradPreenchimento)" />
                  <polyline points="${points}" fill="none" stroke="#FF7A00" stroke-width="2" stroke-linejoin="round" />

                  ${dados
                    .map(
                      (d, i) => `
                    <circle cx="${getX(i)}" cy="${getY(d.mediaAcertos)}" r="2.5" fill="#FF7A00" />
                  `,
                    )
                    .join("")}

                  <g transform="translate(${xVoce}, ${yVoce})" filter="url(#shadow)">
                      <path d="M -5 -12 L 0 -6 L 5 -12 Z" fill="#00C48C" />
                      <rect x="-18" y="-28" width="36" height="16" rx="8" fill="#00C48C" />
                      <text x="0" y="-17" font-size="6.5" fill="white" text-anchor="middle" font-weight="800" style="letter-spacing: 0.5px;">VOCÊ</text>
                      <circle cx="0" cy="0" r="5.5" fill="#00C48C" stroke="white" stroke-width="2" />
                      <circle cx="0" cy="0" r="1.8" fill="white" />
                  </g>
              </svg>
          </div>
      </div>

      <div style="display: flex; justify-content: space-between; padding: 10px 20px 0 50px;">
          ${dados.map((d) => `<span style="font-size: 11px; color: #94A3B8; font-weight: bold;">${d.idade}a</span>`).join("")}
      </div>

      <div style="text-align: right; margin-top: 10px; font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase;">
          Idade (anos)
      </div>
  </div>
  `;
  }
}

export default new TemplateManager();
