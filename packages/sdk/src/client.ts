import axios, { AxiosInstance } from 'axios';
import { ClientOptions, Repository, User, Issue } from './types';

export class OpenCodeHub {
    private client: AxiosInstance;

    constructor(options: ClientOptions = {}) {
        const baseURL = options.baseUrl || 'http://localhost:3000';
        this.client = axios.create({
            baseURL: baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL,
            headers: {
                'Content-Type': 'application/json',
                ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
            },
        });
    }

    public users = {
        get: async (username: string): Promise<User> => {
            const { data } = await this.client.get<{ user: User }>(`/api/users/${username}`);
            return data.user;
        },
        me: async (): Promise<User> => {
            const { data } = await this.client.get<{ user: User }>('/api/auth/me');
            return data.user;
        }
    };

    public repos = {
        list: async (username: string): Promise<Repository[]> => {
            const { data } = await this.client.get<{ repositories: Repository[] }>(`/api/users/${username}/repos`);
            return data.repositories;
        },
        get: async (owner: string, repo: string): Promise<Repository> => {
            const { data } = await this.client.get<{ repository: Repository }>(`/api/repos/${owner}/${repo}`);
            return data.repository;
        },
        create: async (repo: { name: string; visibility: 'public' | 'private'; description?: string }): Promise<Repository> => {
            const { data } = await this.client.post<{ repository: Repository }>('/api/repos', repo);
            return data.repository;
        }
    };

    public issues = {
        list: async (owner: string, repo: string): Promise<Issue[]> => {
            const { data } = await this.client.get<{ issues: Issue[] }>(`/api/repos/${owner}/${repo}/issues`);
            return data.issues;
        },
        create: async (owner: string, repo: string, issue: { title: string; body?: string }): Promise<Issue> => {
            const { data } = await this.client.post<{ issue: Issue }>(`/api/repos/${owner}/${repo}/issues`, issue);
            return data.issue;
        }
    };
}
