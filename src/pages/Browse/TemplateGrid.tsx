import type { Template } from '../../lib/schema/template.schema.ts';
import TemplateCard from './TemplateCard.tsx';

interface TemplateGridProps {
  templates: Template[];
  onSelect: (templateId: string) => void;
}

export default function TemplateGrid({ templates, onSelect }: TemplateGridProps) {
  return (
    <div className="template-grid">
      {templates.map((template) => (
        <TemplateCard key={template.id} template={template} onSelect={onSelect} />
      ))}
    </div>
  );
}
