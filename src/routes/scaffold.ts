import { Hono } from 'hono';
import {
  listAllTemplates,
  listTemplatesByType,
  getTemplate,
  searchTemplates,
  generateProject,
  type ScaffoldType,
  type TemplateId,
  type GenerateOptions,
} from '../services/scaffold.service.js';
import { uploadScaffoldArchive } from '../services/storage.service.js';
import { getDb, schema } from '../db/index.js';
import archiver from 'archiver';

export const scaffoldRouter = new Hono();

/** GET /api/scaffold/templates — List all templates, optionally filter by type */
scaffoldRouter.get('/templates', (c) => {
  const type = c.req.query('type') as ScaffoldType | undefined;
  const templates = type ? listTemplatesByType(type) : listAllTemplates();
  const grouped = {
    total: templates.length,
    contract: templates.filter((t) => t.scaffoldType === 'contract'),
    dapp: templates.filter((t) => t.scaffoldType === 'dapp'),
    fullstack: templates.filter((t) => t.scaffoldType === 'fullstack'),
  };
  return type ? c.json({ total: templates.length, templates }) : c.json(grouped);
});

/** GET /api/scaffold/templates/search?q=... — Search templates */
scaffoldRouter.get('/templates/search', (c) => {
  const q = c.req.query('q') ?? '';
  if (!q) return c.json({ error: 'Missing query parameter "q"' }, 400);
  const results = searchTemplates(q);
  return c.json({ query: q, total: results.length, templates: results });
});

/** GET /api/scaffold/templates/:id — Get single template details */
scaffoldRouter.get('/templates/:id', (c) => {
  const id = c.req.param('id');
  const template = getTemplate(id);
  if (!template) return c.json({ error: 'Template not found' }, 404);
  return c.json(template);
});

/** POST /api/scaffold/preview — Preview generated files (no download) */
scaffoldRouter.post('/preview', async (c) => {
  try {
    const body = await c.req.json<GenerateOptions>();
    if (!body.scaffoldType || !body.template || !body.projectName) {
      return c.json({ error: 'Missing required fields: scaffoldType, template, projectName' }, 400);
    }
    const template = getTemplate(body.template);
    if (!template) return c.json({ error: `Unknown template: ${body.template}` }, 400);

    const files = generateProject({
      scaffoldType: body.scaffoldType,
      template: body.template as TemplateId,
      projectName: body.projectName,
      variables: body.variables ?? {},
    });

    return c.json({
      scaffoldType: body.scaffoldType,
      template: body.template,
      projectName: body.projectName,
      fileCount: files.length,
      totalSize: files.reduce((s, f) => s + Buffer.byteLength(f.content, 'utf-8'), 0),
      files: files.map((f) => ({
        path: f.path,
        size: Buffer.byteLength(f.content, 'utf-8'),
        preview: f.content.slice(0, 500),
      })),
    });
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }
});

/** POST /api/scaffold/generate — Generate project, upload to S3, return download URL */
scaffoldRouter.post('/generate', async (c) => {
  try {
    const body = await c.req.json<GenerateOptions>();
    if (!body.scaffoldType || !body.template || !body.projectName) {
      return c.json({ error: 'Missing required fields: scaffoldType, template, projectName' }, 400);
    }
    const template = getTemplate(body.template);
    if (!template) return c.json({ error: `Unknown template: ${body.template}` }, 400);

    const files = generateProject({
      scaffoldType: body.scaffoldType,
      template: body.template as TemplateId,
      projectName: body.projectName,
      variables: body.variables ?? {},
    });

    const slugName = body.projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Archive all files into a tar.gz buffer
    const archiveBuffer = await new Promise<Buffer>((resolve, reject) => {
      const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      for (const file of files) {
        archive.append(file.content, { name: `${slugName}/${file.path}` });
      }
      archive.finalize();
    });

    // Upload to S3
    const { key, downloadUrl } = await uploadScaffoldArchive(slugName, archiveBuffer);

    // Log to database
    try {
      const db = getDb();
      await db.insert(schema.scaffoldLogs).values({
        scaffoldType: body.scaffoldType,
        template: body.template,
        projectName: body.projectName,
        variables: body.variables ?? {},
        s3Key: key,
      });
    } catch (dbErr) {
      console.warn('Failed to log scaffold generation:', dbErr);
    }

    return c.json({
      success: true,
      scaffoldType: body.scaffoldType,
      template: body.template,
      projectName: body.projectName,
      fileCount: files.length,
      downloadUrl,
      s3Key: key,
      files: files.map((f) => f.path),
    });
  } catch (err) {
    console.error('Scaffold generation failed:', err);
    return c.json({ error: 'Failed to generate project' }, 500);
  }
});
