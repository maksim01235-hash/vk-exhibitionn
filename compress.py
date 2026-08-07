#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Скрипт сжатия изображений JPG/PNG в WEBP до 1.5 МБ
При двойном клике обрабатывает все изображения в папке со скриптом
"""

import os
import sys
from pathlib import Path
from PIL import Image
import argparse
from datetime import datetime

# Константы
MAX_SIZE = 1.5 * 1024 * 1024  # 1.5 МБ в байтах
QUALITY_STEPS = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15]
RESIZE_FACTORS = [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2]

class ImageCompressor:
    def __init__(self, input_path, output_dir=None, verbose=True, keep_original=True):
        self.input_path = Path(input_path)
        self.output_dir = Path(output_dir) if output_dir else self.input_path.parent / "webp_compressed"
        self.verbose = verbose
        self.keep_original = keep_original
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
    
    def get_size(self, img, quality, **kwargs):
        """Получение размера WEBP изображения в байтах без сохранения на диск"""
        from io import BytesIO
        buffer = BytesIO()
        
        # Конвертируем в RGB для WEBP (если нужно)
        if img.mode in ('RGBA', 'LA', 'P'):
            # Сохраняем прозрачность
            img.save(buffer, format='WEBP', quality=quality, lossless=False, **kwargs)
        else:
            img.save(buffer, format='WEBP', quality=quality, lossless=False, **kwargs)
        
        return len(buffer.getvalue())
    
    def prepare_image_for_webp(self, img):
        """Подготовка изображения для WEBP"""
        # Если изображение в режиме CMYK, конвертируем в RGB
        if img.mode == 'CMYK':
            img = img.convert('RGB')
        # Если изображение в режиме P (палитра), конвертируем в RGBA или RGB
        elif img.mode == 'P':
            if 'transparency' in img.info:
                img = img.convert('RGBA')
            else:
                img = img.convert('RGB')
        # Если изображение в режиме LA (черно-белое с альфа), конвертируем в RGBA
        elif img.mode == 'LA':
            img = img.convert('RGBA')
        
        return img
    
    def compress_by_quality(self, img, target_size):
        """Стратегия 1: Уменьшение качества WEBP"""
        self.log("  Стратегия: уменьшение качества (WEBP)")
        
        img = self.prepare_image_for_webp(img)
        best_img = None
        best_size = float('inf')
        best_quality = None
        
        for quality in QUALITY_STEPS:
            try:
                size = self.get_size(img, quality, method=6)  # method=6 лучшее сжатие
                
                if size <= target_size:
                    self.log(f"    ✓ Качество {quality}: {size/1024:.1f} КБ")
                    return img, quality, size
                
                if size < best_size:
                    best_size = size
                    best_img = img.copy()
                    best_quality = quality
                    
            except Exception as e:
                self.log(f"    Ошибка при quality={quality}: {e}")
                continue
        
        # Если не удалось достичь целевого размера
        if best_img:
            self.log(f"    Лучший результат: качество {best_quality}, {best_size/1024:.1f} КБ")
            return best_img, best_quality, best_size
        
        return None, None, None
    
    def compress_by_resize(self, img, target_size):
        """Стратегия 2: Уменьшение разрешения"""
        self.log("  Стратегия: уменьшение разрешения (WEBP)")
        
        img = self.prepare_image_for_webp(img)
        original_size = img.size
        best_img = None
        best_size = float('inf')
        best_factor = None
        
        for factor in RESIZE_FACTORS:
            if factor >= 1.0:
                continue
                
            new_size = (int(original_size[0] * factor), int(original_size[1] * factor))
            if new_size[0] < 10 or new_size[1] < 10:
                continue
                
            try:
                resized = img.resize(new_size, Image.Resampling.LANCZOS)
                quality = 85  # Фиксированное качество для этого метода
                size = self.get_size(resized, quality, method=6)
                
                if size <= target_size:
                    self.log(f"    ✓ Размер {new_size} (фактор {factor}): {size/1024:.1f} КБ")
                    return resized, quality, size
                    
                if size < best_size:
                    best_size = size
                    best_img = resized.copy()
                    best_factor = factor
                    
            except Exception as e:
                self.log(f"    Ошибка при resize factor={factor}: {e}")
                continue
        
        if best_img:
            self.log(f"    Лучший результат: фактор {best_factor}, {best_size/1024:.1f} КБ")
            return best_img, 85, best_size
        
        return None, None, None
    
    def compress_combined(self, img, target_size):
        """Стратегия 3: Комбинированная (уменьшение качества + уменьшение разрешения)"""
        self.log("  Стратегия: комбинированная (WEBP)")
        
        img = self.prepare_image_for_webp(img)
        original_size = img.size
        best_img = None
        best_size = float('inf')
        best_params = None
        
        # Пробуем различные комбинации
        for factor in RESIZE_FACTORS[1:8]:  # от 0.95 до 0.65
            new_size = (int(original_size[0] * factor), int(original_size[1] * factor))
            if new_size[0] < 10 or new_size[1] < 10:
                continue
                
            resized = img.resize(new_size, Image.Resampling.LANCZOS)
            
            for quality in QUALITY_STEPS[3:10]:  # от 80 до 45
                try:
                    size = self.get_size(resized, quality, method=6)
                    
                    if size <= target_size:
                        self.log(f"    ✓ Размер {new_size}, качество {quality}: {size/1024:.1f} КБ")
                        return resized, quality, size
                        
                    if size < best_size:
                        best_size = size
                        best_img = resized.copy()
                        best_params = (new_size, quality)
                        
                except Exception as e:
                    continue
        
        # Если не получилось, пробуем более агрессивные настройки
        for factor in RESIZE_FACTORS[6:13]:  # от 0.7 до 0.35
            new_size = (int(original_size[0] * factor), int(original_size[1] * factor))
            if new_size[0] < 10 or new_size[1] < 10:
                continue
                
            resized = img.resize(new_size, Image.Resampling.LANCZOS)
            
            for quality in QUALITY_STEPS[6:]:  # от 65 до 15
                try:
                    size = self.get_size(resized, quality, method=6)
                    
                    if size <= target_size:
                        self.log(f"    ✓ Размер {new_size}, качество {quality}: {size/1024:.1f} КБ")
                        return resized, quality, size
                        
                    if size < best_size:
                        best_size = size
                        best_img = resized.copy()
                        best_params = (new_size, quality)
                        
                except Exception as e:
                    continue
        
        if best_img:
            self.log(f"    Лучший результат: размер {best_params[0]}, качество {best_params[1]}, {best_size/1024:.1f} КБ")
            return best_img, best_params[1], best_size
        
        return None, None, None
    
    def compress(self):
        """Основной метод сжатия в WEBP"""
        if not self.load_image():
            return False
        
        # Проверяем, нужно ли сжимать
        if self.original_size <= MAX_SIZE:
            self.log(f"Файл уже меньше {MAX_SIZE/1024/1024:.1f} МБ")
            # Все равно конвертируем в WEBP для экономии места
            self.log("Конвертируем в WEBP для дополнительной экономии...")
        
        # Создаем выходную директорию
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Пробуем стратегии по порядку
        strategies = [
            self.compress_by_quality,
            self.compress_by_resize,
            self.compress_combined
        ]
        
        # Определяем имя выходного файла
        output_path = self.output_dir / f"{self.input_path.stem}.webp"
        
        for i, strategy in enumerate(strategies, 1):
            self.log(f"\nПопытка {i}/{len(strategies)}")
            result, quality, final_size = strategy(self.image, MAX_SIZE)
            
            if result and final_size <= MAX_SIZE:
                try:
                    # Сохраняем в WEBP
                    result.save(
                        output_path, 
                        'WEBP', 
                        quality=quality, 
                        method=6,  # Лучшее сжатие
                        lossless=False
                    )
                    
                    compression_ratio = (1 - final_size / self.original_size) * 100
                    self.log(f"✓ Успех! Размер: {final_size/1024:.1f} КБ "
                            f"(сжатие {compression_ratio:.1f}%)")
                    self.log(f"  Качество: {quality}")
                    self.log(f"  Сохранено: {output_path}")
                    
                    # Если нужно сохранить оригинал
                    if not self.keep_original and self.input_path != output_path:
                        try:
                            self.input_path.unlink()
                            self.log(f"  Оригинал удален: {self.input_path.name}")
                        except:
                            pass
                    
                    return True
                    
                except Exception as e:
                    self.log(f"  Ошибка сохранения: {e}")
                    continue
        
        # Если ни одна стратегия не сработала
        self.log(f"✗ Не удалось сжать до {MAX_SIZE/1024/1024:.1f} МБ")
        self.log(f"  Попробуйте использовать другой формат или уменьшить исходное изображение")
        return False

def process_directory(input_dir, output_dir=None, verbose=True, keep_original=True):
    """Обработка всех изображений в директории"""
    input_path = Path(input_dir)
    if not input_path.exists():
        print(f"Ошибка: директория {input_dir} не найдена")
        return
    
    extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
    images = [f for f in input_path.iterdir() if f.suffix.lower() in extensions]
    
    if not images:
        print(f"Не найдено изображений в {input_dir}")
        return
    
    print(f"Найдено {len(images)} изображений для обработки")
    
    success_count = 0
    total_savings = 0
    
    for img_path in images:
        print(f"\n{'='*60}")
        print(f"Обработка: {img_path.name}")
        compressor = ImageCompressor(img_path, output_dir, verbose, keep_original)
        if compressor.compress():
            success_count += 1
            # Подсчет экономии
            try:
                saved = compressor.original_size - Path(output_dir or input_path / "webp_compressed" / f"{img_path.stem}.webp").stat().st_size
                total_savings += saved
            except:
                pass
    
    print(f"\n{'='*60}")
    print(f"Готово! Успешно сжато: {success_count}/{len(images)}")
    if total_savings > 0:
        print(f"Общая экономия: {total_savings/1024/1024:.2f} МБ")

def get_script_folder():
    """Получение папки, где находится скрипт"""
    if getattr(sys, 'frozen', False):
        # Если запущен как .exe
        return Path(sys.executable).parent
    else:
        # Если запущен как .py
        return Path(__file__).parent

def auto_mode():
    """Автоматический режим - обработка всех файлов в папке со скриптом"""
    print("="*70)
    print("  🖼️  КОНВЕРТЕР ИЗОБРАЖЕНИЙ В WEBP (до 1.5 МБ)")
    print("="*70)
    print()
    
    script_folder = get_script_folder()
    print(f"📁 Папка со скриптом: {script_folder}")
    print()
    
    # Проверяем наличие изображений
    extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
    images = [f for f in script_folder.iterdir() if f.suffix.lower() in extensions]
    
    # Исключаем файлы из папки webp_compressed
    images = [f for f in images if 'webp_compressed' not in str(f.parent)]
    
    if not images:
        print("❌ В папке со скриптом не найдено изображений!")
        print("   Поддерживаемые форматы: JPG, JPEG, PNG, BMP, TIFF, WEBP")
        input("\nНажмите Enter для выхода...")
        return
    
    print(f"🔍 Найдено {len(images)} изображений:")
    for img in images:
        size_mb = img.stat().st_size / (1024 * 1024)
        print(f"   📄 {img.name} ({size_mb:.2f} МБ)")
    
    print()
    print("⚙️  Начинаю обработку...")
    print()
    
    # Создаем папку для сжатых файлов
    output_dir = script_folder / "webp_compressed"
    output_dir.mkdir(exist_ok=True)
    
    success_count = 0
    total_original = 0
    total_compressed = 0
    
    for img_path in images:
        print(f"\n{'─'*60}")
        print(f"Обработка: {img_path.name}")
        
        compressor = ImageCompressor(
            img_path, 
            output_dir, 
            verbose=True,
            keep_original=True
        )
        
        if compressor.compress():
            success_count += 1
            total_original += compressor.original_size
            try:
                compressed_path = output_dir / f"{img_path.stem}.webp"
                if compressed_path.exists():
                    total_compressed += compressed_path.stat().st_size
            except:
                pass
    
    # Итоговый отчет
    print()
    print("="*70)
    print("📊 ИТОГОВЫЙ ОТЧЕТ")
    print("="*70)
    print(f"✅ Обработано: {success_count} из {len(images)} изображений")
    
    if success_count > 0:
        print(f"📁 Сжатые файлы сохранены в: {output_dir}")
        
        if total_original > 0 and total_compressed > 0:
            total_savings = (1 - total_compressed / total_original) * 100
            print(f"📊 Общий размер оригиналов: {total_original/1024/1024:.2f} МБ")
            print(f"📊 Общий размер сжатых: {total_compressed/1024/1024:.2f} МБ")
            print(f"📊 Экономия места: {total_savings:.1f}%")
    
    print()
    print("="*70)
    input("Нажмите Enter для выхода...")

def main():
    # Проверяем, был ли запущен скрипт с аргументами командной строки
    if len(sys.argv) > 1:
        # Режим с аргументами (для использования из командной строки)
        parser = argparse.ArgumentParser(
            description='Сжатие изображений в WEBP до 1.5 МБ',
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
Примеры:
  python compress_webp.py image.jpg
  python compress_webp.py images/ -o output/
  python compress_webp.py photo.png --delete-original
            """
        )
        parser.add_argument('input', help='Путь к файлу или директории')
        parser.add_argument('-o', '--output', help='Директория для сохранения WEBP файлов')
        parser.add_argument('-q', '--quiet', action='store_true', help='Тихий режим (без вывода)')
        parser.add_argument('--delete-original', action='store_true', help='Удалить оригинальные файлы после конвертации')
        parser.add_argument('--max-size', type=float, default=1.5, help='Максимальный размер в МБ (по умолчанию: 1.5)')
        
        args = parser.parse_args()
        
        # Обновляем MAX_SIZE если указан другой
        global MAX_SIZE
        MAX_SIZE = args.max_size * 1024 * 1024
        
        input_path = Path(args.input)
        
        if input_path.is_file():
            compressor = ImageCompressor(
                input_path, 
                args.output, 
                not args.quiet,
                not args.delete_original
            )
            compressor.compress()
        elif input_path.is_dir():
            process_directory(
                input_path, 
                args.output, 
                not args.quiet,
                not args.delete_original
            )
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