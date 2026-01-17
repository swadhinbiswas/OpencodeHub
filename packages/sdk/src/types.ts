export interface User {
    id: string;
    username: string;
    email?: string;
    avatarUrl?: string;
}

export interface Repository {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
    visibility: 'public' | 'private' | 'internal';
    full_name: string;
    html_url: string;
}

export interface Issue {
    id: string;
    number: number;
    title: string;
    body?: string;
    state: 'open' | 'closed';
    user: User;
}

export interface ClientOptions {
    baseUrl?: string;
    token?: string;
}
