Python 3 + numpy + Pillow required.
Set CITY_KOREAN_FONT to an installed Korean .ttf/.ttc font path on other platforms.

python build_city.py /absolute/path/to/generated_city
python validate_city.py /absolute/path/to/generated_city

This regenerates meshes, source JSON, signs and primary previews. Keep the delivered Unity Editor script separately.
The inspection-only interior cutaway is not part of main generation.
