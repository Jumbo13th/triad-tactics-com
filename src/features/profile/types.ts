export type ProfileData = {
    connected: boolean;
    items?: { label: string; value: string }[];
    armaGuid?: string | null;
    armaGuidLabel?: string;
    badges?: { label: string }[];
} | null;
