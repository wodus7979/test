"""Compatibility rebuild; both transformation scenes now use one recorded roar."""
from pathlib import Path
import runpy
import shutil
namespace = runpy.run_path(str(Path(__file__).parent / 'Hulk/build_transform_roar.py'))
path = namespace['build']()
shutil.copyfile(path, path.with_name('tank_rage.wav'))
