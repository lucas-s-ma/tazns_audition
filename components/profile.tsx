'use client';
import { classes, origins, sections, type Candidate } from '@/lib/domain';
import { TextField, SelectField, MbtiField } from './fields';
export function Profile({
  candidate: c,
  personal = false,
}: {
  candidate: Candidate;
  personal?: boolean;
}) {
  return (
    <div className="profile-grid">
      {(['first_name', 'last_name'] as const).map((field) => (
        <TextField
          key={field}
          id={c.id}
          target="profile"
          field={field}
          value={c[field]}
          label={
            {
              first_name: 'First name',
              last_name: 'Last name',
              major: 'Major',
              hometown: 'Hometown',
              celebrity_crush: 'Celebrity crush',
            }[field]
          }
          required={personal}
        />
      ))}
      <SelectField
        id={c.id}
        field="class_year"
        value={c.class_year}
        label="Class *"
        options={classes}
      />
      {(['major', 'hometown', 'celebrity_crush'] as const).map((field) => (
        <TextField
          key={field}
          id={c.id}
          target="profile"
          field={field}
          value={c[field]}
          label={
            {
              major: 'Major',
              hometown: 'Hometown',
              celebrity_crush: 'Celebrity crush',
            }[field]
          }
          required={personal}
        />
      ))}
      <MbtiField id={c.id} value={c.mbti} />
      {!personal && (
        <>
          <SelectField
            id={c.id}
            field="primary_section"
            value={c.primary_section}
            label="Primary vocal section"
            options={sections}
          />
          <SelectField
            id={c.id}
            field="secondary_section"
            value={c.secondary_section}
            label="Secondary vocal section"
            options={['None', ...sections]}
          />
          <SelectField
            id={c.id}
            field="origin_1"
            value={c.origin_1}
            label="Cultural origin 1"
            options={origins}
          />
          {c.origin_1 === 'Other' && (
            <TextField
              id={c.id}
              target="profile"
              field="origin_1_other"
              value={c.origin_1_other}
              label="Origin 1 — other"
            />
          )}
          <SelectField
            id={c.id}
            field="origin_2"
            value={c.origin_2}
            label="Cultural origin 2"
            options={['None', ...origins]}
          />
          {c.origin_2 === 'Other' && (
            <TextField
              id={c.id}
              target="profile"
              field="origin_2_other"
              value={c.origin_2_other}
              label="Origin 2 — other"
            />
          )}
        </>
      )}
    </div>
  );
}
