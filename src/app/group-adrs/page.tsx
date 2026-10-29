import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import { BookOpen, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";

export const dynamic = "force-dynamic";

interface GroupAdr {
  file: string;
  title: string;
  status: string;
  content: string;
}

function adrStatus(content: string): string | null {
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^#{1,6}\s+status\s*$/i.test(lines[index].trim())) continue;
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next].trim();
      if (!line) continue;
      if (/^#{1,6}\s+/.test(line)) return null;
      return line.replace(/^[-*]\s+/, "");
    }
  }
  return null;
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const Heading = heading[1].length <= 2 ? "h3" : "h4";
      blocks.push(<Heading key={index}>{heading[2]}</Heading>);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(<li key={index}>{lines[index].trim().replace(/^[-*]\s+/, "")}</li>);
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items}</ul>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^\s*#{1,6}\s+/.test(lines[index]) && !/^\s*[-*]\s+/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.join(" ")}</p>);
  }

  return <div className="adr-content">{blocks}</div>;
}

export default async function GroupAdrsPage() {
  const directory = join(process.cwd(), "sandbox", "standards");
  let entries: string[] = [];
  try {
    entries = (await readdir(directory)).filter((file) => /\.mdx?$/i.test(file)).sort();
  } catch {
    entries = [];
  }

  const adrs: GroupAdr[] = [];
  for (const file of entries) {
    const content = await readFile(join(directory, file), "utf8");
    const status = adrStatus(content);
    if (!status || !/^(accepted|angenommen|akzeptiert|approved|beschlossen)\b/i.test(status)) continue;
    adrs.push({
      file,
      title: /^#\s+(.+)$/m.exec(content)?.[1].trim() ?? file,
      status,
      content,
    });
  }

  return (
    <>
      <div className="breadcrumbs"><Link href="/">Merge Requests</Link><span className="breadcrumb-slash">/</span><strong>Gruppen-ADRs</strong></div>
      <section className="page-heading">
        <div className="page-title-row"><div className="page-title-icon"><BookOpen size={20} /></div><h1>Gruppen-ADRs</h1></div>
      </section>
      {adrs.length === 0 ? (
        <Card className="review-panel"><div className="empty-state"><div className="empty-state-icon"><FileText size={24} /></div><h2>Keine aktiven Gruppen-ADRs gefunden</h2></div></Card>
      ) : (
        <Card className="review-panel">
          <CardHeader className="review-panel-header"><CardTitle>Aktive Gruppen-ADRs ({adrs.length})</CardTitle></CardHeader>
          <Table className="adr-table">
            <colgroup><col className="adr-column-title" /><col className="adr-column-file" /><col className="adr-column-status" /><col className="adr-column-details" /></colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Entscheidung</TableHead>
                <TableHead>Datei</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span className="sr-only">Details</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adrs.map((adr) => (
                <TableRow key={adr.file}>
                  <TableCell colSpan={4} className="adr-table-cell">
                    <details className="adr-table-details">
                      <summary className="adr-table-summary">
                        <span className="adr-table-title"><span className="adr-file-icon"><FileText size={17} /></span><strong>{adr.title}</strong></span>
                        <code className="adr-table-file">{adr.file}</code>
                        <span><Badge variant="success">Angenommen</Badge></span>
                        <span className="adr-table-chevron" aria-hidden="true" />
                      </summary>
                      <CardContent className="adr-body"><MarkdownContent content={adr.content} /></CardContent>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
