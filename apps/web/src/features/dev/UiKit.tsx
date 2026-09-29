/** Dev-only gallery of UI primitives (/dev/ui). Toggle the theme in the header to check dark mode. */
import { useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  Chip,
  Cover,
  Dialog,
  Segmented,
  SelectField,
  Stepper,
  Tag,
  TextAreaField,
  TextField,
} from '../../components/ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t-2 border-rule pt-6">
      <h2 className="m-0 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

const swatches = [
  'bg',
  'surface',
  'surface-2',
  'fg',
  'muted',
  'accent',
  'accent-hover',
  'accent-ink',
  'accent-text',
  'accent-soft',
  'danger',
  'danger-soft',
  'good',
  'good-soft',
];

export function UiKit() {
  const [chip, setChip] = useState('All');
  const [qty, setQty] = useState(1);
  const [role, setRole] = useState<'super' | 'agent'>('super');
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-5 py-8">
      <h1 className="m-0 text-4xl md:text-[76px] md:leading-[0.98] md:tracking-[-0.035em]">
        What's on in{' '}
        <span className="rounded-lg bg-accent px-1.5 text-accent-ink md:rounded-xl md:px-2.5">
          East Africa
        </span>
      </h1>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {swatches.map((name) => (
            <div key={name} className="flex flex-col gap-1.5 text-xs">
              <div
                className="h-14 rounded-lg border border-hair"
                style={{ background: `var(--ev-${name === 'fg' ? 'text' : name})` }}
              />
              <code>{name}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg">Get tickets</Button>
          <Button variant="ink" size="lg">
            Create an event →
          </Button>
          <Button variant="outline" size="sm">
            Create event
          </Button>
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="max-w-sm">
          <Button block size="lg" className="justify-between">
            <span>Get tickets</span>
            <span>KSh 1,200 →</span>
          </Button>
        </div>
      </Section>

      <Section title="Tags">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="danger">SOLD OUT</Tag>
          <Tag tone="accent">ONLY 8 LEFT</Tag>
          <Tag tone="accent">Live</Tag>
          <Tag tone="neutral">Draft</Tag>
          <Tag tone="good">Paid</Tag>
          <Tag shape="square">M-PESA</Tag>
          <Tag shape="square">MTN MOMO</Tag>
          <Tag shape="square" tone="outline">
            Card
          </Tag>
        </div>
      </Section>

      <Section title="Category chips">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
          {['All', 'Corporate', 'Campus', 'Music & Arts', 'Workshops', 'Free'].map((c) => (
            <Chip key={c} active={c === chip} onClick={() => setChip(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <TextField label="Full name" placeholder="e.g. Amina Otieno" className="sm:col-span-2" />
          <TextField label="Phone number" placeholder="+254 7XX XXX XXX" inputMode="tel" />
          <TextField label="Email" placeholder="you@example.com" error="Enter a valid email" />
          <SelectField label="City" defaultValue="Nairobi">
            <option>Nairobi</option>
            <option>Juba</option>
            <option>Mombasa</option>
            <option>Kisumu</option>
          </SelectField>
          <TextField label="Venue or online link" hint="Shown on the ticket and map" />
          <TextAreaField label="Description" className="sm:col-span-2" />
        </div>
      </Section>

      <Section title="Stepper and segmented control">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold">Quantity</span>
            <Stepper value={qty} onChange={setQty} />
          </div>
          <Segmented
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { value: 'super', label: 'Super Admin' },
              { value: 'agent', label: 'Agent' },
            ]}
          />
        </div>
      </Section>

      <Section title="Cards and covers">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['music', 'campus', 'corporate', 'workshop'] as const).map((tone) => (
            <Cover key={tone} tone={tone} className="h-[170px]">
              <div className="absolute top-3 left-3 flex min-w-11 flex-col gap-0.5 rounded-md bg-card-date px-2.5 py-1.5 leading-none">
                <span className="text-[10px] font-extrabold tracking-[0.12em] text-accent-text">
                  FRI
                </span>
                <span className="text-[22px] font-extrabold">02</span>
              </div>
              <span className="absolute bottom-2.5 left-3 font-mono text-[11px] text-white/75">
                {tone}
              </span>
            </Cover>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <div className="text-sm font-semibold text-muted">Tickets sold</div>
            <div className="text-3xl font-extrabold">602</div>
            <div className="text-xs text-muted">+48 this week</div>
          </Card>
          <Card variant="surface" className="flex flex-col gap-2 p-4">
            <div className="flex justify-between text-lg font-extrabold">
              <span>1 × Regular</span>
              <span>KSh 1,200</span>
            </div>
            <span className="text-xs text-muted">The price you see is the price you pay.</span>
          </Card>
        </div>
      </Section>

      <Section title="Dialog">
        <div>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            Open change-rate dialog
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Change fee rate"
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(false)}>
                Apply rate
              </Button>
            </>
          }
        >
          Rate changes apply only to future ticket sales.
        </Dialog>
      </Section>
    </div>
  );
}
