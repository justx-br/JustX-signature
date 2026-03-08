import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { FieldType } from '@prisma/client';
import {
  CalendarIcon,
  CheckSquareIcon,
  ContactIcon,
  DiscIcon,
  HashIcon,
  ListIcon,
  MailIcon,
  TextIcon,
  UserIcon,
} from 'lucide-react';

import { getBoundingClientRect } from '@documenso/lib/client-only/get-bounding-client-rect';
import { useDocumentElement } from '@documenso/lib/client-only/hooks/use-document-element';
import { useCurrentEnvelopeEditor } from '@documenso/lib/client-only/providers/envelope-editor-provider';
import { PDF_VIEWER_PAGE_SELECTOR } from '@documenso/lib/constants/pdf-viewer';
import { FIELD_META_DEFAULT_VALUES } from '@documenso/lib/types/field-meta';
import { nanoid } from '@documenso/lib/universal/id';
import { canRecipientFieldsBeModified } from '@documenso/lib/utils/recipients';
import { SignatureIcon } from '@documenso/ui/icons/signature';
import { RECIPIENT_COLOR_STYLES } from '@documenso/ui/lib/recipient-colors';
import { cn } from '@documenso/ui/lib/utils';
import { FRIENDLY_FIELD_TYPE } from '@documenso/ui/primitives/document-flow/types';

const MIN_HEIGHT_PX = 12;
const MIN_WIDTH_PX = 36;

const DEFAULT_HEIGHT_PX = MIN_HEIGHT_PX * 2.5;
const DEFAULT_WIDTH_PX = MIN_WIDTH_PX * 2.5;

export const fieldButtonList = [
  {
    type: FieldType.SIGNATURE,
    icon: SignatureIcon,
    name: msg`Signature`,
    className: 'font-signature text-lg',
  },
  {
    type: FieldType.EMAIL,
    icon: MailIcon,
    name: msg`Email`,
  },
  {
    type: FieldType.NAME,
    icon: UserIcon,
    name: msg`Name`,
  },
  {
    type: FieldType.INITIALS,
    icon: ContactIcon,
    name: msg`Initials`,
  },
  {
    type: FieldType.DATE,
    icon: CalendarIcon,
    name: msg`Date`,
  },
  {
    type: FieldType.TEXT,
    icon: TextIcon,
    name: msg`Text`,
  },
  {
    type: FieldType.NUMBER,
    icon: HashIcon,
    name: msg`Number`,
  },
  {
    type: FieldType.RADIO,
    icon: DiscIcon,
    name: msg`Radio`,
  },
  {
    type: FieldType.CHECKBOX,
    icon: CheckSquareIcon,
    name: msg`Checkbox`,
  },
  {
    type: FieldType.DROPDOWN,
    icon: ListIcon,
    name: msg`Dropdown`,
  },
];

type EnvelopeEditorFieldDragDropProps = {
  selectedRecipientId: number | null;
  selectedEnvelopeItemId: string | null;
  /** Controlled mode: when provided, parent owns selection. Used for mobile when Sheet closes. */
  selectedFieldFromParent?: FieldType | null;
  /** Called when field type is selected or cleared. Used to close Sheet and persist selection on mobile. */
  onFieldTypeSelect?: (type: FieldType | null) => void;
  /** Whether to hide the field type buttons (placement-only mode). Used when buttons are in Sheet. */
  hideButtons?: boolean;
};

const getEventCoords = (
  event: MouseEvent | TouchEvent,
): { clientX: number; clientY: number; pageX: number; pageY: number } => {
  if ('touches' in event) {
    const t = event.changedTouches?.[0] ?? event.touches?.[0];
    if (t) {
      return { clientX: t.clientX, clientY: t.clientY, pageX: t.pageX, pageY: t.pageY };
    }
  }
  const e = event as MouseEvent;
  return { clientX: e.clientX, clientY: e.clientY, pageX: e.pageX, pageY: e.pageY };
};

export const EnvelopeEditorFieldDragDrop = ({
  selectedRecipientId,
  selectedEnvelopeItemId,
  selectedFieldFromParent,
  onFieldTypeSelect,
  hideButtons = false,
}: EnvelopeEditorFieldDragDropProps) => {
  const { envelope, editorFields, isTemplate, getRecipientColorKey } = useCurrentEnvelopeEditor();

  const { t } = useLingui();

  const [internalSelectedField, setInternalSelectedField] = useState<FieldType | null>(null);

  const isControlled = selectedFieldFromParent !== undefined;
  const selectedField = isControlled ? selectedFieldFromParent : internalSelectedField;

  const setSelectedField = useCallback(
    (field: FieldType | null) => {
      if (field !== null) {
        lastSelectionTime.current = Date.now();
      }
      if (onFieldTypeSelect) {
        onFieldTypeSelect(field);
      }
      if (!isControlled) {
        setInternalSelectedField(field);
      }
    },
    [isControlled, onFieldTypeSelect],
  );

  const { isWithinPageBounds, getPage } = useDocumentElement();

  const isFieldsDisabled = useMemo(() => {
    const selectedSigner = envelope.recipients.find(
      (recipient) => recipient.id === selectedRecipientId,
    );
    const fields = envelope.fields;

    if (!selectedSigner) {
      return true;
    }

    // Allow fields to be modified for templates regardless of anything.
    if (isTemplate) {
      return false;
    }

    return !canRecipientFieldsBeModified(selectedSigner, fields);
  }, [selectedRecipientId, envelope.recipients, envelope.fields]);

  const [isFieldWithinBounds, setIsFieldWithinBounds] = useState(false);
  const [coords, setCoords] = useState({
    x: 0,
    y: 0,
  });

  const fieldBounds = useRef({
    height: 0,
    width: 0,
  });

  const lastSelectionTime = useRef<number>(0);

  const getNormalizedEvent = useCallback((event: MouseEvent | TouchEvent) => {
    const { clientX, clientY, pageX, pageY } = getEventCoords(event);
    const target = (event as MouseEvent).target ?? (event as TouchEvent).target;
    return { clientX, clientY, pageX, pageY, target } as MouseEvent;
  }, []);

  const onPointerMove = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const e = getNormalizedEvent(event);
      setIsFieldWithinBounds(
        isWithinPageBounds(
          e,
          PDF_VIEWER_PAGE_SELECTOR,
          fieldBounds.current.width,
          fieldBounds.current.height,
        ),
      );

      setCoords({
        x: e.clientX - fieldBounds.current.width / 2,
        y: e.clientY - fieldBounds.current.height / 2,
      });
    },
    [isWithinPageBounds, getNormalizedEvent],
  );

  const isInteractiveElement = useCallback((target: EventTarget | null) => {
    if (!target || !(target instanceof Element)) {
      return false;
    }
    return !!target.closest(
      'button, a, [role="button"], [role="tab"], [data-radix-collection-item], [data-sheet-trigger], [data-radix-popper-content-wrapper], [role="dialog"]',
    );
  }, []);

  const onPointerUp = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!selectedField || !selectedRecipientId || !selectedEnvelopeItemId) {
        return;
      }

      const target = (event as MouseEvent).target ?? (event as TouchEvent).target;
      if (isInteractiveElement(target)) {
        return;
      }

      if (Date.now() - lastSelectionTime.current < 300) {
        return;
      }

      const e = getNormalizedEvent(event);
      const $page = getPage(e, PDF_VIEWER_PAGE_SELECTOR);

      if (
        !$page ||
        !isWithinPageBounds(
          e,
          PDF_VIEWER_PAGE_SELECTOR,
          fieldBounds.current.width,
          fieldBounds.current.height,
        )
      ) {
        setSelectedField(null);
        return;
      }

      const { top, left, height, width } = getBoundingClientRect($page);

      const pageNumber = parseInt($page.getAttribute('data-page-number') ?? '1', 10);

      let pageX = ((e.pageX - left) / width) * 100;
      let pageY = ((e.pageY - top) / height) * 100;

      const fieldPageWidth = (fieldBounds.current.width / width) * 100;
      const fieldPageHeight = (fieldBounds.current.height / height) * 100;

      pageX -= fieldPageWidth / 2;
      pageY -= fieldPageHeight / 2;

      const field = {
        formId: nanoid(12),
        envelopeItemId: selectedEnvelopeItemId,
        type: selectedField,
        page: pageNumber,
        positionX: pageX,
        positionY: pageY,
        width: fieldPageWidth,
        height: fieldPageHeight,
        recipientId: selectedRecipientId,
        fieldMeta: structuredClone(FIELD_META_DEFAULT_VALUES[selectedField]),
      };

      editorFields.addField(field);

      setIsFieldWithinBounds(false);
      setSelectedField(null);
    },
    [
      isWithinPageBounds,
      selectedField,
      selectedRecipientId,
      selectedEnvelopeItemId,
      getPage,
      editorFields,
      getNormalizedEvent,
      isInteractiveElement,
    ],
  );

  useEffect(() => {
    const observer = new MutationObserver((_mutations) => {
      const $page = document.querySelector(PDF_VIEWER_PAGE_SELECTOR);

      if (!$page) {
        return;
      }

      fieldBounds.current = {
        height: Math.max(DEFAULT_HEIGHT_PX),
        width: Math.max(DEFAULT_WIDTH_PX),
      };
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!selectedField) {
      return;
    }

    const handleMove = (e: MouseEvent | TouchEvent) => {
      onPointerMove(e);
    };

    const handleUp = (e: MouseEvent | TouchEvent) => {
      onPointerUp(e);
    };

    window.addEventListener('mousemove', handleMove as EventListener);
    window.addEventListener('mouseup', handleUp as EventListener);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove as EventListener);
      window.removeEventListener('mouseup', handleUp as EventListener);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [onPointerUp, onPointerMove, selectedField]);

  const selectedRecipientColor = useMemo(() => {
    return selectedRecipientId ? getRecipientColorKey(selectedRecipientId) : 'green';
  }, [selectedRecipientId, getRecipientColorKey]);

  return (
    <>
      {!hideButtons && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
          {fieldButtonList.map((field) => (
            <button
              disabled={isFieldsDisabled}
              key={field.type}
              type="button"
              onClick={() => setSelectedField(field.type)}
              onMouseDown={() => setSelectedField(field.type)}
              data-selected={selectedField === field.type ? true : undefined}
              className={cn(
                'group flex h-12 cursor-pointer items-center justify-center rounded-lg border border-border px-4 transition-colors',
                RECIPIENT_COLOR_STYLES[selectedRecipientColor].fieldButton,
              )}
            >
              <p
                className={cn(
                  'flex items-center justify-center gap-x-1.5 font-noto text-sm font-normal text-muted-foreground group-data-[selected]:text-foreground',
                  field.className,
                  {
                    'group-hover:text-recipient-green': selectedRecipientColor === 'green',
                    'group-hover:text-recipient-blue': selectedRecipientColor === 'blue',
                    'group-hover:text-recipient-purple': selectedRecipientColor === 'purple',
                    'group-hover:text-recipient-orange': selectedRecipientColor === 'orange',
                    'group-hover:text-recipient-yellow': selectedRecipientColor === 'yellow',
                    'group-hover:text-recipient-pink': selectedRecipientColor === 'pink',
                  },
                )}
              >
                {field.type !== FieldType.SIGNATURE && <field.icon className="h-4 w-4" />}
                {t(field.name)}
              </p>
            </button>
          ))}
        </div>
      )}

      {selectedField && (
        <div
          className={cn(
            'dark:text-muted-background pointer-events-none fixed z-50 flex cursor-pointer flex-col items-center justify-center rounded-[2px] bg-white font-noto text-muted-foreground ring-2 transition duration-200 [container-type:size]',
            RECIPIENT_COLOR_STYLES[selectedRecipientColor].base,
            selectedField === FieldType.SIGNATURE && 'font-signature',
            {
              '-rotate-6 scale-90 opacity-50 dark:bg-black/20': !isFieldWithinBounds,
              'dark:text-black/60': isFieldWithinBounds,
            },
          )}
          style={{
            top: coords.y,
            left: coords.x,
            height: fieldBounds.current.height,
            width: fieldBounds.current.width,
          }}
        >
          <span className="text-[clamp(0.425rem,25cqw,0.825rem)]">
            {t(FRIENDLY_FIELD_TYPE[selectedField])}
          </span>
        </div>
      )}
    </>
  );
};
