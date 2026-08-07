#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Скрипт создания превью изображений до 100 КБ
При двойном клике обрабатывает все изображения в папке со скриптом
Поддерживает JPG, PNG, WEBP
"""

import os
import sys
from pathlib import Path
from PIL import Image, ImageOps
import argparse
from datetime import datetime

# Константы
MAX_PREVIEW_SIZE = 100 * 1024  # 100 КБ в байтах

# БОЛЕЕ ЩАДЯЩИЕ РАЗМЕРЫ ДЛЯ ПРЕВЬЮ (начинаем с больших)
THUMBNAIL_SIZES = [
    (800, 800),   # Очень большое
    (700, 700),   # Большое
    (600, 600),   # Средне-большое
    (500, 500),   # Среднее
    (400, 400),   # Средне-маленькое
    (300, 300),   # Маленькое
    (200, 200),   # Очень маленькое
]

# БОЛЕЕ ВЫСОКОЕ КАЧЕСТВО (начинаем с максимального)
QUALITY_STEPS = [95, 92, 90, 88, 85, 82, 80, 78, 75, 72, 70, 68, 65, 60, 55, 50]

class PreviewGenerator:
    def __init__(self, input_path, output_dir=None, verbose=True, max_size=100):
        self.input_path = Path(input_path)
        self.output_dir = Path(output_dir) if output_dir else self.input_path.parent / "previews"
        self.verbose = verbose
        self.max_size = max_size * 1024  # Конвертируем в байты
        self.original_size = self.input_path.stat().st_size
        self.image = None
        self.format = None
        
    def log(self, message):
        if self.verbose:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
    
    def load_image(self):
        """Загрузка изображения"""
        try:
            self.image = Image.open(self.input_path)
            self.format = self.image.format
            self.log(f"Загружено: {self.input_path.name} ({self.format}, {self.image.size})")
            return True
        except Exception as e:
            self.log(f"Ошибка загрузки: {e}")
            return False
    
    def get_size(self, img, format='WEBP', quality=80, **kwargs):
        """Получение размера изображения в байтах без сохранения на диск"""
        from io import BytesIO
        buffer = BytesIO()
        
        # Подготовка изображения для сохранения
        if format == 'JPEG':
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            img.save(buffer, format='JPEG', quality=quality, optimize=True, **kwargs)
        elif format == 'WEBP':
            if img.mode == 'CMYK':
                img = img.convert('RGB')
            img.save(buffer, format='WEBP', quality=quality, method=6, lossless=False, **kwargs)
        else:  # PNG
            img.save(buffer, format='PNG', optimize=True, **kwargs)
            
        return len(buffer.getvalue())
    
    def prepare_image(self, img):
        """Подготовка изображения к сохранению"""
        if img.mode == 'CMYK':
            img = img.convert('RGB')
        elif img.mode == 'P':
            if 'transparency' in img.info:
                img = img.convert('RGBA')
            else:
                img = img.convert('RGB')
        elif img.mode == 'LA':
            img = img.convert('RGBA')
        return img
    
    def create_thumbnail_strategy(self, img, target_size):
        """Стратегия 1: Создание превью с уменьшением размера"""
        self.log("  Стратегия: уменьшение размера")
        
        img = self.prepare_image(img)
        original_width, original_height = img.size
        
        # Пробуем разные размеры превью (от больших к маленьким)
        for thumb_size in THUMBNAIL_SIZES:
            try:
                # Создаем превью с сохранением пропорций
                preview = ImageOps.contain(img, thumb_size, Image.Resampling.LANCZOS)
                
                # Пробуем WEBP с высоким качеством
                for quality in QUALITY_STEPS[:8]:  # 95-80
                    size = self.get_size(preview, 'WEBP', quality)
                    if size <= target_size:
                        self.log(f"    ✓ Размер {thumb_size}, WEBP, качество {quality}: {size/1024:.1f} КБ")
                        return preview, 'WEBP', quality, size
                
                # Если WEBP не подходит, пробуем JPEG
                for quality in QUALITY_STEPS[:10]:  # 95-75
                    size = self.get_size(preview, 'JPEG', quality)
                    if size <= target_size:
                        self.log(f"    ✓ Размер {thumb_size}, JPEG, качество {quality}: {size/1024:.1f} КБ")
                        return preview, 'JPEG', quality, size
                            
            except Exception as e:
                self.log(f"    Ошибка при размере {thumb_size}: {e}")
                continue
        
        return None, None, None, None
    
    def create_optimal_strategy(self, img, target_size):
        """Стратегия 2: Оптимальный подбор параметров (максимальное качество)"""
        self.log("  Стратегия: оптимальный подбор (максимальное качество)")
        
        img = self.prepare_image(img)
        width, height = img.size
        
        # Определяем максимальный размер, который влезет в 100 КБ
        aspect_ratio = width / height
        
        # Пробуем разные размеры (от больших к маленьким)
        for max_dim in [800, 700, 600, 500, 450, 400, 350, 300, 250, 200]:
            if aspect_ratio >= 1:
                new_width = max_dim
                new_height = int(max_dim / aspect_ratio)
            else:
                new_height = max_dim
                new_width = int(max_dim * aspect_ratio)
            
            if new_width < 50 or new_height < 50:
                continue
                
            try:
                preview = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # Пробуем WEBP с высоким качеством
                for quality in QUALITY_STEPS:  # 95-50
                    size = self.get_size(preview, 'WEBP', quality)
                    if size <= target_size:
                        self.log(f"    ✓ Размер {new_width}x{new_height}, WEBP, качество {quality}: {size/1024:.1f} КБ")
                        return preview, 'WEBP', quality, size
                
                # Если WEBP не подходит, пробуем JPEG
                for quality in QUALITY_STEPS:  # 95-50
                    size = self.get_size(preview, 'JPEG', quality)
                    if size <= target_size:
                        self.log(f"    ✓ Размер {new_width}x{new_height}, JPEG, качество {quality}: {size/1024:.1f} КБ")
                        return preview, 'JPEG', quality, size
                        
            except Exception as e:
                continue
        
        return None, None, None, None
    
    def create_preview(self):
        """Основной метод создания превью"""
        if not self.load_image():
            return False
        
        # Создаем выходную директорию
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Пробуем стратегии по порядку
        strategies = [
            self.create_thumbnail_strategy,
            self.create_optimal_strategy
        ]
        
        # Определяем имя выходного файла
        output_filename = f"{self.input_path.stem}_preview"
        output_ext = None
        
        for i, strategy in enumerate(strategies, 1):
            self.log(f"\nПопытка {i}/{len(strategies)}")
            result, fmt, quality, final_size = strategy(self.image, self.max_size)
            
            if result and final_size <= self.max_size:
                # Определяем расширение
                if fmt == 'WEBP':
                    output_ext = '.webp'
                elif fmt == 'JPEG':
                    output_ext = '.jpg'
                else:
                    output_ext = '.png'
                
                output_path = self.output_dir / f"{output_filename}{output_ext}"
                
                try:
                    # Сохраняем результат
                    if fmt == 'WEBP':
                        result.save(output_path, 'WEBP', quality=quality, method=6, lossless=False)
                    elif fmt == 'JPEG':
                        if result.mode in ('RGBA', 'LA', 'P'):
                            result = result.convert('RGB')
                        result.save(output_path, 'JPEG', quality=quality, optimize=True)
                    else:
                        result.save(output_path, 'PNG', optimize=True)
                    
                    compression_ratio = (1 - final_size / self.original_size) * 100
                    size_ratio = final_size / 1024  # В КБ
                    
                    # Определяем качество в процентах
                    quality_percent = quality
                    if fmt == 'WEBP':
                        quality_percent = quality
                    elif fmt == 'JPEG':
                        quality_percent = quality
                    
                    self.log(f"✓ Готово! Размер: {final_size/1024:.1f} КБ (из {self.original_size/1024:.1f} КБ)")
                    self.log(f"  Формат: {fmt}, Качество: {quality_percent}%")
                    self.log(f"  Размер превью: {result.size[0]}x{result.size[1]}")
                    self.log(f"  Сохранено: {output_path}")
                    return True
                    
                except Exception as e:
                    self.log(f"  Ошибка сохранения: {e}")
                    continue
        
        self.log(f"✗ Не удалось создать превью меньше {self.max_size/1024:.1f} КБ")
        return False

def process_directory(input_dir, output_dir=None, verbose=True, max_size=100):
    """Обработка всех изображений в директории"""
    input_path = Path(input_dir)
    if not input_path.exists():
        print(f"Ошибка: директория {input_dir} не найдена")
        return
    
    extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp', '.gif'}
    images = [f for f in input_path.iterdir() if f.suffix.lower() in extensions]
    
    if not images:
        print(f"Не найдено изображений в {input_dir}")
        return
    
    print(f"\n{'='*60}")
    print(f"Создание превью для {len(images)} изображений")
    print(f"Целевой размер: до {max_size} КБ")
    print(f"{'='*60}\n")
    
    success_count = 0
    total_original_size = 0
    total_preview_size = 0
    
    for img_path in images:
        print(f"\n{'─'*60}")
        print(f"Обработка: {img_path.name}")
        generator = PreviewGenerator(img_path, output_dir, verbose, max_size)
        if generator.create_preview():
            success_count += 1
            total_original_size += generator.original_size
            # Получаем размер созданного превью
            preview_path = generator.output_dir / f"{img_path.stem}_preview"
            for ext in ['.webp', '.jpg', '.jpeg', '.png']:
                test_path = Path(str(preview_path) + ext)
                if test_path.exists():
                    total_preview_size += test_path.stat().st_size
                    break
    
    print(f"\n{'='*60}")
    print(f"Готово! Создано превью: {success_count}/{len(images)}")
    if total_original_size > 0:
        total_savings = (1 - total_preview_size / total_original_size) * 100
        print(f"Общий размер оригиналов: {total_original_size/1024/1024:.2f} МБ")
        print(f"Общий размер превью: {total_preview_size/1024/1024:.2f} МБ")
        print(f"Экономия места: {total_savings:.1f}%")
        if success_count > 0:
            avg_size = total_preview_size / success_count
            print(f"Средний размер превью: {avg_size/1024:.1f} КБ")

def get_script_folder():
    """Получение папки, где находится скрипт"""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    else:
        return Path(__file__).parent

def auto_mode():
    """Автоматический режим - обработка всех файлов в папке со скриптом"""
    print("="*70)
    print("  🖼️  СОЗДАНИЕ ПРЕВЬЮ (до 100 КБ)")
    print("="*70)
    print()
    
    script_folder = get_script_folder()
    print(f"📁 Папка со скриптом: {script_folder}")
    print()
    
    # Проверяем наличие изображений
    extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp', '.gif'}
    images = [f for f in script_folder.iterdir() if f.suffix.lower() in extensions]
    
    # Исключаем файлы из папки previews
    images = [f for f in images if 'previews' not in str(f.parent)]
    
    if not images:
        print("❌ В папке со скриптом не найдено изображений!")
        print("   Поддерживаемые форматы: JPG, JPEG, PNG, BMP, TIFF, WEBP, GIF")
        input("\nНажмите Enter для выхода...")
        return
    
    print(f"🔍 Найдено {len(images)} изображений:")
    for img in images:
        size_mb = img.stat().st_size / (1024 * 1024)
        size_kb = img.stat().st_size / 1024
        if size_mb >= 1:
            print(f"   📄 {img.name} ({size_mb:.2f} МБ)")
        else:
            print(f"   📄 {img.name} ({size_kb:.1f} КБ)")
    
    print()
    print("⚙️  Начинаю создание превью (максимальное качество)...")
    print()
    
    # Создаем папку для превью
    output_dir = script_folder / "previews"
    output_dir.mkdir(exist_ok=True)
    
    success_count = 0
    total_original = 0
    total_preview = 0
    
    for img_path in images:
        print(f"\n{'─'*60}")
        print(f"Обработка: {img_path.name}")
        
        generator = PreviewGenerator(
            img_path, 
            output_dir, 
            verbose=True,
            max_size=100
        )
        
        if generator.create_preview():
            success_count += 1
            total_original += generator.original_size
            # Находим созданное превью
            preview_path = output_dir / f"{img_path.stem}_preview"
            for ext in ['.webp', '.jpg', '.jpeg', '.png']:
                test_path = Path(str(preview_path) + ext)
                if test_path.exists():
                    total_preview += test_path.stat().st_size
                    break
    
    # Итоговый отчет
    print()
    print("="*70)
    print("📊 ИТОГОВЫЙ ОТЧЕТ")
    print("="*70)
    print(f"✅ Создано превью: {success_count} из {len(images)} изображений")
    
    if success_count > 0:
        print(f"📁 Превью сохранены в: {output_dir}")
        
        if total_original > 0 and total_preview > 0:
            total_savings = (1 - total_preview / total_original) * 100
            print(f"📊 Общий размер оригиналов: {total_original/1024/1024:.2f} МБ")
            print(f"📊 Общий размер превью: {total_preview/1024/1024:.2f} МБ")
            print(f"📊 Экономия места: {total_savings:.1f}%")
            
            # Показываем средний размер превью
            avg_size = total_preview / success_count
            print(f"📊 Средний размер превью: {avg_size/1024:.1f} КБ")
            
            # Показываем минимальный и максимальный размер
            preview_sizes = []
            for img_path in images:
                preview_path = output_dir / f"{img_path.stem}_preview"
                for ext in ['.webp', '.jpg', '.jpeg', '.png']:
                    test_path = Path(str(preview_path) + ext)
                    if test_path.exists():
                        preview_sizes.append(test_path.stat().st_size)
                        break
            
            if preview_sizes:
                print(f"📊 Минимальный размер: {min(preview_sizes)/1024:.1f} КБ")
                print(f"📊 Максимальный размер: {max(preview_sizes)/1024:.1f} КБ")
    
    print()
    print("="*70)
    input("Нажмите Enter для выхода...")

def main():
    # Проверяем, был ли запущен скрипт с аргументами командной строки
    if len(sys.argv) > 1:
        # Режим с аргументами (для использования из командной строки)
        parser = argparse.ArgumentParser(
            description='Создание превью изображений (до 100 КБ)',
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
Примеры:
  python create_previews.py image.jpg
  python create_previews.py images/ -o previews/
  python create_previews.py photo.png --max-size 50
  python create_previews.py images/ --format jpg
            """
        )
        parser.add_argument('input', help='Путь к файлу или директории')
        parser.add_argument('-o', '--output', help='Директория для сохранения превью')
        parser.add_argument('-q', '--quiet', action='store_true', help='Тихий режим (без вывода)')
        parser.add_argument('--max-size', type=int, default=100, 
                           help='Максимальный размер превью в КБ (по умолчанию: 100)')
        parser.add_argument('--format', choices=['webp', 'jpg', 'png'], default='webp',
                           help='Формат выходных файлов (по умолчанию: webp)')
        parser.add_argument('--prefix', default='preview_',
                           help='Префикс для имени файлов (по умолчанию: preview_)')
        
        args = parser.parse_args()
        
        input_path = Path(args.input)
        
        if input_path.is_file():
            generator = PreviewGenerator(input_path, args.output, not args.quiet, args.max_size)
            generator.create_preview()
        elif input_path.is_dir():
            process_directory(input_path, args.output, not args.quiet, args.max_size)
        else:
            print(f"Ошибка: {args.input} не является файлом или директорией")
            sys.exit(1)
    else:
        # Режим автозапуска (при двойном клике)
        try:
            auto_mode()
        except Exception as e:
            print(f"\n❌ Критическая ошибка: {e}")
            print("\nУбедитесь, что установлена библиотека Pillow:")
            print("  pip install Pillow")
            input("\nНажмите Enter для выхода...")

if __name__ == "__main__":
    main()