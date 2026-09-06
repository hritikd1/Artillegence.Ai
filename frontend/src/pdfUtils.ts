import * as pdfjsLib from 'pdfjs-dist';

// For Vite, setting the workerSrc is important.
// Since pdfjs-dist 3.x/4.x, we can point to the local node_modules version or a CDN.
// To avoid build issues, we'll use the unpkg CDN for the worker matching the installed version.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const extractTextFromPdfFile = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = '';
        
        // Extract text from all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        
        return fullText.trim();
    } catch (error) {
        console.error("Error extracting text from PDF:", error);
        throw new Error("Failed to extract text from the PDF file.");
    }
};
