import type { components } from '../../../lib/api-types';

export type ImportRowError = components['schemas']['ImportErrorDetailDto'];
export type ImportReport = components['schemas']['ImportReportResponseDto'];
export type ImportDone = components['schemas']['ImportDoneResponseDto'];
export type ImportColumn = NonNullable<ImportRowError['column']>;
export type ImportRowErrorCode = components['schemas']['ImportRowErrorCode'];
