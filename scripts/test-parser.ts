import * as XLSX from "xlsx";
import {
  normalizeNumber,
  detectType,
  parseBuffer,
  eq,
  ColumnType,
  ColumnInfo,
  ParsedFile,
} from "../lib/parser";

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean): void {
  if (condition) { console.log(`  \u2713 ${description}`); passed++; }
  else { console.error(`  \u2717 ${description}`); failed++; }
}

function assertEqual<T>(description: string, actual: T, expected: T): void {
  assert(description, eq<unknown>(actual as unknown, expected as unknown));
}

function assertNull(description: string, actual: unknown): void {
  assert(description, actual === null);
}

function assertThrows(description: string, fn: () => unknown): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assert(description, threw);
}

function section(name: string): void {
  console.log(`\n\u2500\u2500 ${name}`);
}

function makeXlsxBuffer(data: unknown[][]): Buffer {
  const wb: XLSX.WorkBook = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet<unknown>(data);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function makeCsvBuffer(data: unknown[][], separator = ","): Buffer {
  const lines: string[] = data.map((row: unknown[]) =>
    row.map((c: unknown) => (c === null || c === undefined ? "" : String(c))).join(separator)
  );
  return Buffer.from(lines.join("\n"), "utf-8");
}

section("normalizeNumber");
assertEqual("intero", normalizeNumber(42), 42);
assertEqual("float", normalizeNumber(3.14), 3.14);
assertEqual('"1234"', normalizeNumber("1234"), 1234);
assertEqual('"1.234,56" IT', normalizeNumber("1.234,56"), 1234.56);
assertEqual('"1.234.567" IT', normalizeNumber("1.234.567"), 1234567);
assertEqual('"1,234.56" EN', normalizeNumber("1,234.56"), 1234.56);
assertEqual('"1,234,567" EN', normalizeNumber("1,234,567"), 1234567);
assertEqual('"3,14" decimale', normalizeNumber("3,14"), 3.14);
assertNull("stringa vuota", normalizeNumber(""));
assertNull("null", normalizeNumber(null));
assertNull("undefined", normalizeNumber(undefined));
assertNull("N/A", normalizeNumber("N/A"));
assertNull('"-"', normalizeNumber("-"));
assertEqual('"-1.234,56"', normalizeNumber("-1.234,56"), -1234.56);
assertNull("Infinity", normalizeNumber(Infinity));

section("detectType");
assertEqual("prezzi puri", detectType([10.5, 20, 30.99, 15, 8]), "numeric" as ColumnType);
assertEqual("stringhe numeriche", detectType(["100","200","300","400"]), "numeric" as ColumnType);
assertEqual("nomi", detectType(["Mario","Luigi","Anna","Marco","Sara"]), "categorical" as ColumnType);
assertEqual("categorie", detectType(["Elettronica","Abbigliamento","Casa","Sport","Elettronica"]), "categorical" as ColumnType);
assertEqual("UUID lunghi", detectType(["a1b2c3d4-e5f6-7890-abcd-ef1234567890","b2c3d4e5-f6a7-8901-bcde-f01234567891","c3d4e5f6-a7b8-9012-cdef-012345678912","d4e5f6a7-b8c9-0123-defa-123456789013","e5f6a7b8-c9d0-1234-efab-234567890124"]), "unknown" as ColumnType);
assertEqual("70%+null", detectType([100,null,200,null,300,null,400,500,600,700]), "numeric" as ColumnType);
assertEqual("tutto null", detectType([null,null,null,null]), "unknown" as ColumnType);
assertEqual("vuoto", detectType([]), "unknown" as ColumnType);
assertEqual("misto <70%", detectType(["10","Si","No","20","Si","No","Si","No","10","No"]), "categorical" as ColumnType);
assertEqual("singolo numero", detectType([42]), "numeric" as ColumnType);
assertEqual("bool-like", detectType(["true","false","true","false","true"]), "categorical" as ColumnType);
assertEqual("numeri IT", detectType(["1.234,56","2.345,67","3.456,78","4.567,89"]), "numeric" as ColumnType);
assertEqual("negativi", detectType([-1,-2,-3,-4,-5]), "numeric" as ColumnType);
assertEqual("70% boundary", detectType([1,2,3,4,5,6,7,"t1","t2","t3"]), "numeric" as ColumnType);
assertEqual("64% <soglia", detectType([1,2,3,4,5,6,7,8,9,"t1","t2","t3","t4","t5"]), "categorical" as ColumnType);
assertEqual("vuoti+numeri", detectType([100,"",200,"",300]), "numeric" as ColumnType);
assertEqual("citta", detectType(["Roma","Milano","Napoli","Torino","Roma","Milano"]), "categorical" as ColumnType);
assertEqual("singolo testo", detectType(["hello"]), "categorical" as ColumnType);
assertEqual("solo N/A", detectType(["N/A","N/A","N/A","N/A"]), "categorical" as ColumnType);
assertEqual("mix IT+EN", detectType(["1.234,56","1,234.56","1000","500.25"]), "numeric" as ColumnType);

section("parseBuffer — 5 tipi");

const r1: ParsedFile = parseBuffer(makeXlsxBuffer([["Prodotto","Vendite","Prezzo","Categoria"],["A","100","10.50","El"],["B","200","20.00","Ca"],["C","150","15.75","El"]]), "xlsx");
assert("xlsx rowCount", r1.rowCount === 3);
assert("xlsx header", r1.headers[0] === "Prodotto");
assert("xlsx no-gen-headers", !r1.hasGeneratedHeaders);
assert("xlsx numeric", r1.columns.find((c: ColumnInfo) => c.name === "Vendite")?.type === "numeric");

const r2: ParsedFile = parseBuffer(makeCsvBuffer([["Nome","Importo"],["Alpha","1000"],["Beta","2000"]], ","), "csv");
assert("csv-comma rowCount", r2.rowCount === 2);
assert("csv-comma numeric", r2.columns.find((c: ColumnInfo) => c.name === "Importo")?.type === "numeric");

const r3: ParsedFile = parseBuffer(makeXlsxBuffer([[100,200,300],[110,210,310],[120,220,320]]), "xlsx");
assert("no-header gen-headers", r3.hasGeneratedHeaders);
assert("no-header Col1", r3.headers[0] === "Col1");

const r4: ParsedFile = parseBuffer(makeXlsxBuffer([["ID","Val","Note"],["1","100","ok"],["2",null,"x"],[null,"300",null]]), "xlsx");
assert("sparse rowCount>=2", r4.rowCount >= 2);

const r5: ParsedFile = parseBuffer(makeCsvBuffer([["Art","Qty","Prezzo"],["Penna","50","0.80"],["Quad","30","2.50"]], ";"), "csv");
assert("csv-semi rowCount", r5.rowCount === 2);
assert("csv-semi header", r5.headers[0] === "Art");

section("parseBuffer — errori");
assertThrows(".txt lancia", () => parseBuffer(Buffer.from("test"), "txt"));
assertThrows(".pdf lancia", () => parseBuffer(Buffer.from("%PDF"), "pdf"));
try {
  const empty: ParsedFile = parseBuffer(makeCsvBuffer([]), "csv");
  assert("csv vuoto rowCount 0", empty.rowCount === 0);
} catch { assert("csv vuoto no-throw", false); }

section("eq");
assert("primitivi uguali", eq<number>(1, 1));
assert("primitivi diversi", !eq<number>(1, 2));
assert("null null", eq<null>(null, null));
assert("null vs val", !eq<unknown>(null, 1));
assert("obj shallow =", eq<Record<string,unknown>>({a:1,b:2},{a:1,b:2}));
assert("obj shallow !=", !eq<Record<string,unknown>>({a:1},{a:2}));
assert("obj nested =", eq<Record<string,unknown>>({a:{b:1}},{a:{b:1}}));
assert("array =", eq<number[]>([1,2,3],[1,2,3]));
assert("array !=", !eq<number[]>([1,2],[1,3]));

console.log(`\n${"=".repeat(50)}`);
console.log(`  Risultati: ${passed} passati, ${failed} falliti`);
console.log(`${"=".repeat(50)}\n`);
if (failed > 0) process.exit(1);
