# Bases Matrix View

A powerful Matrix view for Obsidian's Bases feature that displays data in interactive 2D grids with advanced bucketing and drag-and-drop functionality.

![Matrix View Demo](demo-screenshot.png)

## Features

### 🏗️ **Advanced Matrix Visualization**
- **2D Grid Layout**: Display any two properties as rows and columns
- **Interactive Cells**: Click cells to drill down into specific combinations
- **Sticky Axis Bar**: Always-visible configuration summary with interactive controls

### 📊 **Smart Bucketing System**
Choose how to group your data with four bucketing strategies:

#### **Categorical** (Default)
- Groups by exact text values
- Supports drag-and-drop reordering
- Perfect for status, priority, category fields

#### **Date Relative**
- Groups dates into: Overdue, Today, This Week, Next Week, This Month, Later
- Automatically updates based on current date
- Great for deadline and schedule tracking

#### **Number Ranges**
- Custom numeric ranges (e.g., "Low: 0-3", "Medium: 3-7", "High: 7+")
- Perfect for priority scores, budgets, ratings

#### **Number Quantiles**
- Automatic statistical distribution (Q1, Q2, Q3, Q4)
- Data-driven grouping based on your actual values
- Ideal for analyzing distributions

### 🔄 **Multi-Value Support**
Handle properties with arrays intelligently:

#### **Disallow** (Safe Default)
- Prevents drag-and-drop when arrays are present
- Ensures data integrity

#### **Explode**
- Items with multiple values appear in **multiple cells**
- Example: `tags: [work, urgent]` appears in both "work" and "urgent" columns

#### **Primary**
- Uses only the first value for bucketing
- Other values are preserved but not displayed

### 🎯 **Drag-and-Drop Functionality**
- **Safe Reordering**: Move items between buckets with intelligent conflict resolution
- **Multi-Value Aware**: Different behaviors for Explode vs Primary modes
- **Status Indicators**: Clear feedback about when drag-and-drop is available
- **Data Integrity**: Prevents operations that could lose information

### 🎛️ **Interactive Configuration**
- **Property Picker**: Searchable dropdown to choose row/column properties
- **Bucketing Controls**: One-click access to bucketing configuration
- **Multi-Mode Selector**: Quick toggling between multi-value handling modes
- **Real-time Updates**: Changes take effect immediately without reloading

## Installation

### From Obsidian Community Plugins
1. Open Settings → Community plugins
2. Browse and search for "Bases Matrix View"
3. Install and enable the plugin

### Manual Installation
1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/your-repo/releases)
2. Create folder: `VaultFolder/.obsidian/plugins/bases-matrix-view/`
3. Copy files into the folder
4. Reload Obsidian and enable in Community plugins

## Usage

### Basic Setup
1. Create or open a `.base` file in your vault
2. Add the Matrix view from the view picker
3. Configure row and column properties using the axis bar chips
4. Choose bucketing strategies for each axis
5. Set multi-value handling modes as needed

### Configuration Options

#### View Configuration (Bases Configure Panel)
- **Rows Property**: Choose which frontmatter property defines row groupings
- **Columns Property**: Choose which frontmatter property defines column groupings
- **Include Empty**: Whether to show buckets with no items
- **Cell Display**: Choose between Cards, Compact, or Count-only display
- **Max Cards**: Limit cards shown per cell
- **Enable Drag**: Toggle drag-and-drop functionality

#### Advanced Configuration (Interactive Axis Bar)
- **Bucketing**: Click any bucketing chip to configure grouping strategy
- **Multi-Value Mode**: Click mode chips to change array handling
- **Property Selection**: Click property chips to choose different fields

### Example Use Cases

#### Project Management
```
Rows: status (Categorical)
Columns: priority (Number Ranges: Low|1-3, Medium|4-6, High|7-10)
Multi-value: Primary
```
Track projects across completion status and priority levels.

#### Content Calendar
```
Rows: publish_date (Date Relative)
Columns: category (Categorical)
Multi-value: Explode
```
Plan content across time periods with multi-category support.

#### Budget Tracking
```
Rows: department (Categorical)
Columns: budget (Number Quantiles)
Multi-value: Disallow
```
Analyze budget distributions across departments.

## Requirements

- **Obsidian**: 1.10.0 or later (Bases feature required)
- **Platform**: Desktop and mobile supported

## Development

### Setup
```bash
npm install
npm run dev  # Watch mode
npm run build  # Production build
```

### Project Structure
```
src/
├── main.ts                 # Plugin entry point
├── bases/
│   ├── matrixView.ts       # Main matrix view component
│   ├── bucketEngine.ts     # Bucketing logic
│   ├── bucketSpec.ts       # Type definitions
│   ├── multiValue.ts       # Multi-value handling
│   ├── valueCodec.ts       # Data transformation
│   └── axisState.ts        # Configuration persistence
└── ui/
    ├── axisBar.ts          # Interactive axis configuration
    ├── bucketConfigModal.ts # Bucketing setup
    ├── propertyPickerModal.ts # Property selection
    └── drilldownModal.ts   # Cell detail view
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Documentation**: [Bases Documentation](https://docs.obsidian.md/plugins/guides/bases-view)

## Changelog

### v0.0.1
- Initial release with basic matrix functionality
- Categorical bucketing support
- Drag-and-drop reordering
- Multi-value array handling (Disallow/Explode/Primary)
- Interactive axis bar with live configuration
- Advanced bucketing: Date Relative, Number Ranges, Number Quantiles
- Comprehensive status indicators and user feedback
