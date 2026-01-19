# WeasyPrint Documentation

This document provides Claude Code context for using WeasyPrint in this project.

## Project Usage

WeasyPrint is used for generating PDF documents from HTML:

| File | Purpose |
|------|---------|
| `core/document_generator.py` | Generate quote/binder PDFs |
| `core/package_generator.py` | Generate document packages |

## Installation

```bash
pip install weasyprint
```

Note: WeasyPrint requires system dependencies (cairo, pango, etc.). On macOS:
```bash
brew install cairo pango gdk-pixbuf libffi
```

## Basic Usage

### Generate PDF from URL

```python
from weasyprint import HTML

HTML('https://example.com/').write_pdf('/tmp/output.pdf')
```

### Generate PDF from HTML String

```python
from weasyprint import HTML

html_content = """
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <h1>Quote Summary</h1>
    <p>Premium: $50,000</p>
</body>
</html>
"""

HTML(string=html_content).write_pdf('/tmp/quote.pdf')
```

### Generate PDF from File

```python
from weasyprint import HTML

HTML(filename='template.html').write_pdf('output.pdf')
```

### Return PDF as Bytes

```python
from weasyprint import HTML

# Get PDF as bytes (useful for storage or streaming)
pdf_bytes = HTML(string=html_content).write_pdf()

# Upload to storage
storage.upload(pdf_bytes, "quote.pdf")
```

## CSS Styling

### Inline Stylesheet

```python
from weasyprint import HTML, CSS

HTML('https://example.com/').write_pdf(
    '/tmp/output.pdf',
    stylesheets=[CSS(string='body { font-family: serif !important }')]
)
```

### External Stylesheet

```python
from weasyprint import HTML, CSS

html = HTML(string='<h1>The title</h1>')
css = CSS(filename='styles.css')

html.write_pdf('/tmp/output.pdf', stylesheets=[css])
```

### Multiple Stylesheets

```python
from weasyprint import HTML, CSS

html = HTML(filename='document.html')
stylesheets = [
    CSS(filename='base.css'),
    CSS(filename='print.css'),
    CSS(string='@page { margin: 1cm }'),
]

html.write_pdf('output.pdf', stylesheets=stylesheets)
```

## Font Configuration

Handle custom fonts with `@font-face`:

```python
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration

font_config = FontConfiguration()

html = HTML(string='<h1>Custom Font Title</h1>')
css = CSS(string='''
    @font-face {
        font-family: Gentium;
        src: url(https://example.com/fonts/Gentium.otf);
    }
    h1 { font-family: Gentium }
''', font_config=font_config)

html.write_pdf(
    '/tmp/output.pdf',
    stylesheets=[css],
    font_config=font_config
)
```

## PDF Options

### Zoom

```python
HTML(string=html_content).write_pdf(
    'output.pdf',
    zoom=1.5  # 150% zoom
)
```

### Custom Finisher

Post-process the generated PDF:

```python
def my_finisher(document, pdf):
    # Custom PDF manipulation
    # document is the WeasyPrint document
    # pdf is the output PDF bytes
    pass

HTML(string=html_content).write_pdf(
    'output.pdf',
    finisher=my_finisher
)
```

## Page Layout with CSS

### Page Size and Margins

```css
@page {
    size: letter;  /* or A4, 8.5in 11in, etc. */
    margin: 1in;
}

/* Different margins for first page */
@page :first {
    margin-top: 2in;
}
```

### Headers and Footers

```css
@page {
    @top-center {
        content: "Quote Document";
    }
    @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
    }
}
```

### Page Breaks

```css
/* Force page break before */
.new-section {
    page-break-before: always;
}

/* Avoid page break inside */
.keep-together {
    page-break-inside: avoid;
}
```

## Jinja2 Integration

Common pattern for generating dynamic PDFs:

```python
from jinja2 import Template
from weasyprint import HTML, CSS

# HTML template with Jinja2 placeholders
template = Template("""
<html>
<head>
    <style>
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #ddd; padding: 8px; }
        .premium { font-size: 24px; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Quote for {{ company_name }}</h1>

    <p class="premium">Total Premium: ${{ "{:,.0f}".format(premium) }}</p>

    <table>
        <tr>
            <th>Coverage</th>
            <th>Limit</th>
            <th>Retention</th>
        </tr>
        {% for coverage in coverages %}
        <tr>
            <td>{{ coverage.name }}</td>
            <td>${{ "{:,.0f}".format(coverage.limit) }}</td>
            <td>${{ "{:,.0f}".format(coverage.retention) }}</td>
        </tr>
        {% endfor %}
    </table>
</body>
</html>
""")

# Render with data
html_content = template.render(
    company_name="Acme Corp",
    premium=50000,
    coverages=[
        {"name": "Network Security", "limit": 5000000, "retention": 50000},
        {"name": "Privacy Liability", "limit": 5000000, "retention": 50000},
    ]
)

# Generate PDF
pdf_bytes = HTML(string=html_content).write_pdf()
```

## Error Handling

```python
from weasyprint import HTML
import logging

# Enable WeasyPrint logging for debugging
logging.getLogger('weasyprint').setLevel(logging.WARNING)

try:
    pdf = HTML(string=html_content).write_pdf()
except Exception as e:
    print(f"PDF generation failed: {e}")
```

## Best Practices

1. **CSS for Print** - Use `@page` rules for page layout
2. **Avoid JavaScript** - WeasyPrint doesn't execute JavaScript
3. **Inline Images** - Use base64 data URLs for reliability
4. **Font Configuration** - Always use `FontConfiguration` for custom fonts
5. **Testing** - Test PDF output with different content lengths

## Common Issues

### Missing Fonts
Install system fonts or use web fonts with `@font-face`.

### Images Not Loading
Use absolute URLs or base64-encoded images:
```python
import base64

with open("logo.png", "rb") as f:
    logo_b64 = base64.b64encode(f.read()).decode()

html = f'<img src="data:image/png;base64,{logo_b64}">'
```

### Large Documents
For very large documents, consider:
- Splitting into multiple PDFs
- Reducing image resolution
- Using simpler CSS

## References

- [WeasyPrint Documentation](https://doc.courtbouillon.org/weasyprint/stable/)
- [WeasyPrint GitHub](https://github.com/Kozea/WeasyPrint)
- [CSS Paged Media](https://www.w3.org/TR/css-page-3/)
