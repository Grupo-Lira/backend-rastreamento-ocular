import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import templateManager from "../templates/templates.js";

class RelatorioPdfService {
  async gerarRelatorioPaciente(pacienteId, pacienteData) {
    try {
      const reportsDir = path.join(process.cwd(), "relatorios");
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const html = templateManager.processarTemplate(pacienteData);

      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: "networkidle0",
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `relatorio_paciente_${pacienteData.nome}_${timestamp}.pdf`;
      const filePath = path.join(reportsDir, fileName);

      await page.pdf({
        path: filePath,
        format: "A4",
        printBackground: true,
        margin: {
          top: "20mm",
          right: "15mm",
          bottom: "20mm",
          left: "15mm",
        },
      });

      await browser.close();

      return {
        success: true,
        filePath: filePath,
        fileName: fileName,
      };
    } catch (error) {
      console.error("Erro ao gerar relatório PDF:", error);
      console.error("Stack trace:", error.stack);
      console.error("Detalhes do erro:", {
        message: error.message,
        name: error.name,
        code: error.code,
      });
      throw new Error("Não foi possível gerar o relatório PDF");
    }
  }
}

export default new RelatorioPdfService();
