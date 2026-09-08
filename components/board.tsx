'use client';
import { useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { ratingLabel, sections, type Candidate, type Evaluation } from '@/lib/domain';
function CardContents({
  candidate: c,
  team,
  dragHandle,
}: {
  candidate: Candidate;
  team?: Evaluation;
  dragHandle?: ReactNode;
}) {
  return (
    <>
      <div className="card-heading">
        {dragHandle ? (
          <a href={`/deliberation/${c.id}`} className="card-name">
            {c.first_name} {c.last_name}
          </a>
        ) : (
          <span className="card-name">
            {c.first_name} {c.last_name}
          </span>
        )}
        {dragHandle}
      </div>
      <p>
        {c.class_year ?? 'Class unset'} · {c.mbti.replaceAll('_', '·')}
      </p>
      <p>
        Primary: {c.primary_section ?? 'Unset'}
        <br />
        Secondary: {c.secondary_section ?? 'Unset'}
      </p>
      <div className="team-overall">
        <span>Team Overall:</span>
        <b className={`badge ${team?.overall_rating?.toLowerCase() ?? 'grey'}`}>
          {ratingLabel(team?.overall_rating ?? null)}
        </b>
      </div>
    </>
  );
}
function Card({ candidate: c, team }: { candidate: Candidate; team?: Evaluation }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  return (
    <article
      ref={setNodeRef}
      className={`board-card ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <CardContents
        candidate={c}
        team={team}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            className="drag-handle"
            aria-label={`Drag ${c.first_name} ${c.last_name}`}
          >
            <GripVertical size={18} />
          </button>
        }
      />
    </article>
  );
}
function Lane({
  lane,
  candidates,
  team,
  horizontal = false,
}: {
  lane: string;
  candidates: Candidate[];
  team: Evaluation[];
  horizontal?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane });
  return (
    <section
      ref={setNodeRef}
      className={`board-lane lane-${lane.toLowerCase()} ${horizontal ? 'horizontal-lane' : ''} ${isOver ? 'over' : ''}`}
    >
      <h3>
        {lane === 'UNDECIDED' ? 'Undecided' : lane === 'REJECTED' ? 'Rejected' : lane}
        <span>{candidates.length}</span>
      </h3>
      <div className="lane-cards">
        {candidates.map((c) => (
          <Card key={c.id} candidate={c} team={team.find((t) => t.candidate_id === c.id)} />
        ))}
        {!candidates.length && <p className="drop-hint">Drop a candidate here</p>}
      </div>
    </section>
  );
}
export function Board({
  candidates,
  team,
  onMove,
}: {
  candidates: Candidate[];
  team: Evaluation[];
  onMove: (id: string, lane: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const start = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const end = (e: DragEndEvent) => {
    if (e.over) onMove(String(e.active.id), String(e.over.id));
    setActiveId(null);
  };
  const activeCandidate = candidates.find((candidate) => candidate.id === activeId);
  const activeTeam = activeCandidate
    ? team.find((evaluation) => evaluation.candidate_id === activeCandidate.id)
    : undefined;
  return (
    <DndContext
      sensors={sensors}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="board">
        {(['UNDECIDED', 'REJECTED'] as const).map((lane) => (
          <Lane
            key={lane}
            lane={lane}
            horizontal
            candidates={candidates.filter((c) => !c.excluded && c.deliberation_status === lane)}
            team={team}
          />
        ))}
        <div className="board-section-lanes">
          {sections.map((lane) => (
            <Lane
              key={lane}
              lane={lane}
              candidates={candidates.filter(
                (c) =>
                  !c.excluded &&
                  c.deliberation_status === 'ACCEPTED' &&
                  c.accepted_section === lane,
              )}
              team={team}
            />
          ))}
        </div>
      </div>
      <DragOverlay zIndex={1000} dropAnimation={null}>
        {activeCandidate && (
          <article className="board-card drag-overlay">
            <CardContents candidate={activeCandidate} team={activeTeam} />
          </article>
        )}
      </DragOverlay>
    </DndContext>
  );
}
