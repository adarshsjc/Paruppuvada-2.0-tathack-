import os
import shutil
from pathlib import Path
import zipfile

def create_split_zips(source_dir, output_dir, prefix, max_mb=9):
    source_path = Path(source_dir)
    output_path = Path(output_dir)
    
    # Files to exclude to keep sizes small
    exclude_dirs = {'.git', 'node_modules', 'venv', '__pycache__', '.next', 'dist', 'build'}
    
    # 1. Gather files and sizes
    files_with_sizes = []
    for root, dirs, files in os.walk(source_path):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            file_path = Path(root) / file
            try:
                size = os.path.getsize(file_path)
                files_with_sizes.append((file_path, size))
            except:
                pass
                
    # Sort files by size to pack optimally
    files_with_sizes.sort(key=lambda x: x[1], reverse=True)
    
    max_bytes = max_mb * 1024 * 1024
    
    parts = []
    current_part = []
    current_size = 0
    
    for file_path, size in files_with_sizes:
        if current_size + size > max_bytes and current_part:
            # Current part is full, start a new one
            parts.append(current_part)
            current_part = []
            current_size = 0
            
        current_part.append(file_path)
        current_size += size
        
    if current_part:
        parts.append(current_part)
        
    print(f"Dividing {source_dir} into {len(parts)} zip files (max {max_mb}MB each)...")
    
    output_path.mkdir(parents=True, exist_ok=True)
    
    for i, file_list in enumerate(parts):
        zip_name = output_path / f"{prefix}_part_{i+1}.zip"
        with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_path in file_list:
                rel_path = file_path.relative_to(source_path)
                # Keep folder structure inside zip
                zf.write(file_path, arcname=f"{source_path.name}/{rel_path}")
        
        zip_size = os.path.getsize(zip_name)
        print(f"Created {zip_name.name} - {zip_size / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    create_split_zips(r"d:\project\Thtava final\MiroFish", r"d:\project\Thtava final\parts", "MiroFish", max_mb=9.5)
    create_split_zips(r"d:\project\Thtava final\graphify", r"d:\project\Thtava final\parts", "graphify", max_mb=9.5)
