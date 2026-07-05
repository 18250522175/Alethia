export interface EvidenceSpan {
  span_id: string;
  slug: string;
  source_file_hash: string;
  source_text_offset: number;
  source_text_length: number;
  original_location: string; // "page=23" or "12:05"
  span_text: string;
  lang: string;
  confidence?: number;
  source_type?: 'pdf' | 'docx' | 'audio' | 'video' | 'web' | 'image' | 'text';
}
