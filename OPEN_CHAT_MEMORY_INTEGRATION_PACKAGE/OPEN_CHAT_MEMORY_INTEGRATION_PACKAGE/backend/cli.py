import argparse
import requests
import sys

def main():
    parser = argparse.ArgumentParser(description="Autonomous Agent Platform CLI")
    parser.add_argument("--url", type=str, default="http://127.0.0.1:8000/api/v1", help="API URL")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_create = subparsers.add_parser("project-create")
    p_create.add_argument("name", type=str)

    p_list = subparsers.add_parser("project-list")

    p_m_save = subparsers.add_parser("memory-save")
    p_m_save.add_argument("content", type=str)
    p_m_save.add_argument("--project-id", type=str, default=None)
    p_m_save.add_argument("--global", action="store_true", dest="is_global")

    p_m_search = subparsers.add_parser("memory-search")
    p_m_search.add_argument("query", type=str, nargs="?", default="")
    p_m_search.add_argument("--project-id", type=str, default=None)

    p_task = subparsers.add_parser("task-submit")
    p_task.add_argument("task", type=str)
    p_task.add_argument("--project-id", type=str, default=None)

    args = parser.parse_args()

    if args.command == "project-create":
        res = requests.post(f"{args.url}/projects", json={"name": args.name})
        if res.status_code == 200: print(f"Created Project: {res.json()}")
        else: print(res.text)

    elif args.command == "project-list":
        res = requests.get(f"{args.url}/projects")
        for p in res.json(): print(f"{p['id']} - {p['name']}")

    elif args.command == "memory-save":
        item = {
            "content": args.content,
            "type": "global" if args.is_global else "project",
            "project_id": args.project_id,
            "source": "cli"
        }
        res = requests.post(f"{args.url}/memory", json=item)
        print(f"Saved: {res.json()}")

    elif args.command == "memory-search":
        params = {"q": args.query}
        if args.project_id: params["project_id"] = args.project_id
        res = requests.get(f"{args.url}/memory", params=params)
        for m in res.json(): print(f"[{m['type']}] {m['id']}: {m['content']}")

    elif args.command == "task-submit":
        payload = {"description": args.task, "project_id": args.project_id}
        res = requests.post(f"{args.url}/tasks", json=payload)
        data = res.json()
        print(f"\nStatus: {data.get('status')}\nResult: {data.get('result')}\n")

if __name__ == "__main__": main()
