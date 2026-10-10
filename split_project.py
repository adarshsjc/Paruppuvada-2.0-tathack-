import os
import shutil
from pathlib import Path

def generate_tree(dir_path, exclude_dirs):
    tree_str = f"Project Structure for {Path(dir_path).name}:\n\n"
    for root, dirs, files in os.walk(dir_path):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        level = root.replace(dir_path, '').count(os.sep)
        indent = ' ' * 4 * (level)
        tree_str += f"{indent}{os.path.basename(root)}/\n"
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            tree_str += f"{subindent}{f}\n"
    return tree_str

def split_project_for_ai(source_dir, output_dir, num_parts=6):
    source_path = Path(source_dir)
    output_path = Path(output_dir)
    
    exclude_dirs = {'.git', 'node_modules', 'venv', '__pycache__', 'parts', '.pytest_cache'}
    
    # Core context files that should go into EVERY part so the AI always has the full idea
    context_files_names = ['README.md', 'project.md', 'design.md']
    context_files = []
    
    files_with_sizes = []
    
    # 1. Gather files
    for root, dirs, files in os.walk(source_path):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            file_path = Path(root) / file
            
            if output_path in file_path.parents or file == 'split_project.py':
                continue
                
            if file in context_files_names and file_path.parent == source_path:
                context_files.append(file_path)
                continue # We will handle these separately
                
            try:
                size = os.path.getsize(file_path)
                files_with_sizes.append((file_path, size))
            except Exception as e:
                pass
                
    # 2. Sort files by size descending
    files_with_sizes.sort(key=lambda x: x[1], reverse=True)
    
    # 3. Initialize parts
    parts = {i: {'size': 0, 'files': []} for i in range(1, num_parts + 1)}
    
    # 4. Distribute files
    for file_path, size in files_with_sizes:
        smallest_part = min(parts.keys(), key=lambda k: parts[k]['size'])
        parts[smallest_part]['files'].append(file_path)
        parts[smallest_part]['size'] += size
        
    # 5. Clean output dir
    if output_path.exists():
        shutil.rmtree(output_path)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Generate Project Tree
    tree_content = generate_tree(source_dir, exclude_dirs)
    
    print(f"Splitting project into {num_parts} parts for AI context...")
    
    for part_id, data in parts.items():
        part_dir = output_path / f"part_{part_id}"
        
        # Copy regular files
        for file_path in data['files']:
            rel_path = file_path.relative_to(source_path)
            dest_path = part_dir / rel_path
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file_path, dest_path)
            
        # Add context files to EVERY part
        for ctx_file in context_files:
            if ctx_file.exists():
                shutil.copy2(ctx_file, part_dir / ctx_file.name)
                
        # Write project structure
        with open(part_dir / 'PROJECT_STRUCTURE.txt', 'w', encoding='utf-8') as f:
            f.write(tree_content)
            
        # Write AI Instructions
        ai_instructions = f"""AI INSTRUCTIONS
----------------
This is PART {part_id} out of {num_parts} of a larger project. 
To ensure you understand the entire context:
1. Review the 'README.md', 'project.md', and 'design.md' files included in this folder. They define the overall goals and architecture.
2. Review the 'PROJECT_STRUCTURE.txt' file to understand how all the files connect across the entire project.
3. This part only contains a fraction of the actual code. Wait until all {num_parts} parts are uploaded before providing a final analysis.
"""
        with open(part_dir / f'00_AI_READ_ME_FIRST_PART_{part_id}.txt', 'w', encoding='utf-8') as f:
            f.write(ai_instructions)
            
        print(f"Created {part_dir.name} with AI context.")

if __name__ == "__main__":
    split_project_for_ai(
        source_dir=r"d:\project\Thtava final",
        output_dir=r"d:\project\Thtava final\parts",
        num_parts=6
    )
